import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { githubClient, registerGitHubRoutes, type GitHubClient } from './auth/github.ts';
import { registerAuthRoutes } from './auth/routes.ts';
import type { AppConfig } from './config.ts';
import type { Db } from './db.ts';
import { registerStateGuards } from './guards.ts';
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
}

export function buildApp({
  db,
  config,
  clock = systemClock,
  scheduler = systemClock,
  media = liveKitMedia(config.livekit),
  github = githubClient(config.github.clientId, config.github.clientSecret),
  logger = false,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });
  const routeTable: { method: string; url: string }[] = [];
  app.decorate('routeTable', routeTable);
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) if (method !== 'HEAD') routeTable.push({ method, url: route.url });
  });

  app.get('/health', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch (error) {
      app.log.error(error, 'health: banco inacessível');
      return reply.code(503).send({ status: 'error' });
    }
  });

  registerStateGuards(app, config.publicUrl);
  registerAuthRoutes(app, { db, config, clock });
  registerSpaceRoutes(app, { db, config, clock });
  registerProfileRoutes(app, { db, config, clock });
  registerDeskRoutes(app, { db, config, clock });
  registerGitHubRoutes(app, { db, config, clock, github });
  registerOrgRoutes(app, { db, config, clock });
  registerInviteRoutes(app, { db, config, clock });
  registerMapRoutes(app, { db, config, clock });

  const gateway = attachGateway(app.server, {
    db,
    publicUrl: config.publicUrl,
    clock,
    scheduler,
    media,
    log: app.log,
  });
  app.decorate('realtime', gateway);
  app.addHook('onClose', () => {
    gateway.close();
  });

  return app;
}
