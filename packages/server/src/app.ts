import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuthRoutes } from './auth/routes.ts';
import type { AppConfig } from './config.ts';
import type { Db } from './db.ts';
import { registerStateGuards } from './guards.ts';
import { systemClock, type Clock, type Scheduler } from './realtime/clock.ts';
import { attachGateway, type Gateway } from './realtime/gateway.ts';
import { liveKitMedia, type MediaService } from './realtime/media.ts';
import { registerDeskRoutes } from './spaces/desk-routes.ts';
import { registerProfileRoutes } from './spaces/profile-routes.ts';
import { registerSpaceRoutes } from './spaces/routes.ts';

declare module 'fastify' {
  interface FastifyInstance {
    realtime: Gateway;
  }
}

export interface AppDeps {
  db: Db;
  config: AppConfig;
  clock?: Clock;
  scheduler?: Scheduler;
  media?: MediaService;
  logger?: boolean;
}

export function buildApp({
  db,
  config,
  clock = systemClock,
  scheduler = systemClock,
  media = liveKitMedia(config.livekit),
  logger = false,
}: AppDeps): FastifyInstance {
  const app = Fastify({ logger });

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
