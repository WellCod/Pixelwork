import rateLimit from '@fastify/rate-limit';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { githubClient, registerGitHubRoutes, type GitHubClient } from './auth/github.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import type { AppConfig } from './config.ts';
import type { Db } from './db.ts';
import { registerStateGuards } from './guards.ts';
import { Metrics } from './metrics.ts';
import { systemClock, type Clock, type Scheduler } from './realtime/clock.ts';
import { attachGateway, type Gateway } from './realtime/gateway.ts';
import { liveKitMedia, type MediaService } from './realtime/media.ts';
import { registerDeskRoutes } from './spaces/desk-routes.ts';
import { registerInviteRoutes } from './spaces/invite-routes.ts';
import { registerMapRoutes } from './spaces/map-routes.ts';
import { registerOrgRoutes } from './spaces/org-routes.ts';
import { registerProfileRoutes } from './spaces/profile-routes.ts';
import { registerSpaceRoutes } from './spaces/routes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Gateway;
    /** Rotas registradas, para a tabela de isolamento de tenant nos testes. */
    routeTable: { method: string; url: string }[];
  }
}

export interface AppDeps {
  db: Db;
  config: AppConfig;
  clock?: Clock;
  scheduler?: Scheduler;
  media?: MediaService;
  github?: GitHubClient;
  logger?: boolean;
  /** Os testes desligam para criar muitos convidados do mesmo IP. */
  rateLimit?: boolean;
}

/** Limite geral por IP; rotas que criam contas ou gravam muito têm o próprio, mais baixo. */
export const RATE_LIMIT_PER_MINUTE = 300;

/** Convite é bearer no caminho: quem lê o log não pode entrar no coworking com ele. */
export function maskUrl(url: string): string {
  return url.replace(/^\/invites\/[^/?#]+/, '/invites/***');
}

function serializeRequest(request: FastifyRequest): Record<string, unknown> {
  return { method: request.method, url: maskUrl(request.url), host: request.host, remoteAddress: request.ip };
}

export function buildApp({
  db,
  config,
  clock = systemClock,
  scheduler = systemClock,
  media = liveKitMedia(config.livekit),
  github = githubClient(config.github.clientId, config.github.clientSecret),
  logger = false,
  rateLimit: limit = true,
}: AppDeps): FastifyInstance {
  // Atrás do Caddy o IP do cliente vem no X-Forwarded-For; sem isso o limite veria só o proxy.
  const app = Fastify({
    logger: logger ? { serializers: { req: serializeRequest } } : false,
    trustProxy: config.trustProxy,
  });
  const routeTable: { method: string; url: string }[] = [];
  app.decorate('routeTable', routeTable);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) if (method !== 'HEAD') routeTable.push({ method, url: route.url });
  });

  // O healthcheck do Docker chama a cada 15 s: fora do log de requisições.
  app.get('/health', { logLevel: 'warn' }, async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch (error) {
      app.log.error(error, 'health: banco inacessível');
      return reply.code(503).send({ status: 'error' });
    }
  });

  const metrics = new Metrics();
  // Só na rede interna: o Caddy não repassa /metrics (fora da lista de rotas da API).
  app.get('/metrics', { logLevel: 'warn' }, (_request, reply) => {
    void reply.type('text/plain; version=0.0.4');
    return metrics.render({
      connections: gateway.connections(),
      runtimes: gateway.runtimesLoaded(),
      players: gateway.players(),
      games: gateway.games(),
    });
  });

  registerStateGuards(app, config.publicUrl);
  // Escopo filho: o plugin de limite precisa estar carregado antes de as rotas serem declaradas.
  void app.register(async (api) => {
    if (limit) await api.register(rateLimit, { max: RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' });
    registerAuthRoutes(api, { db, config, clock });
    registerSpaceRoutes(api, { db, config, clock });
    registerProfileRoutes(api, { db, config, clock });
    registerDeskRoutes(api, { db, config, clock });
    registerGitHubRoutes(api, { db, config, clock, github });
    registerOrgRoutes(api, { db, config, clock });
    registerInviteRoutes(api, { db, config, clock });
    registerMapRoutes(api, { db, config, clock });
  });

  const gateway = attachGateway(app.server, {
    db,
    publicUrl: config.publicUrl,
    clock,
    scheduler,
    media,
    log: app.log,
    metrics,
  });
  app.decorate('realtime', gateway);
  app.addHook('onClose', () => {
    gateway.close();
    metrics.stop();
  });

  return app;
}
