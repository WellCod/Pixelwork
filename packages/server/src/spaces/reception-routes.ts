import { compileMap } from '@pixelwork/shared';
import { spaces } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthDeps } from '../auth/routes.ts';
import { parseBody } from '../http.ts';
import { requireMember, type SpaceParams } from './access.ts';

const Settings = z.strictObject({ enabled: z.boolean() });

export function registerReceptionRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db, config } = deps;
  const selection = { enabled: spaces.receptionEnabled, map: spaces.map };
  const status = (row: { enabled: boolean; map: unknown }) => {
    const compiled = compileMap(row.map);
    return { enabled: row.enabled, installationEnabled: config.receptionistEnabled === true, hasMarker: compiled.ok && compiled.map.reception !== undefined };
  };

  app.get<{ Params: SpaceParams }>('/spaces/:spaceId/reception', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    const [row] = await db.select(selection).from(spaces).where(eq(spaces.id, access.spaceId));
    return row ? status(row) : reply.code(404).send({ error: 'not_found' });
  });

  app.put<{ Params: SpaceParams }>('/spaces/:spaceId/reception', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    const body = await parseBody(Settings, request, reply);
    if (!body) return reply;
    const [row] = await db.update(spaces).set({ receptionEnabled: body.enabled }).where(eq(spaces.id, access.spaceId)).returning(selection);
    return row ? status(row) : reply.code(404).send({ error: 'not_found' });
  });
}
