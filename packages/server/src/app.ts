import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Db } from './db.ts';

export interface AppDeps {
  db: Db;
  logger?: boolean;
}

export function buildApp({ db, logger = false }: AppDeps): FastifyInstance {
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

  return app;
}
