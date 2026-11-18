import { orgs, spaceMembers, spaces } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import { resolveMembership } from './members.ts';

export function registerSpaceRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;

  app.get('/spaces', async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    return db
      .select({
        id: spaces.id,
        name: spaces.name,
        slug: spaces.slug,
        orgName: orgs.name,
        role: spaceMembers.role,
      })
      .from(spaceMembers)
      .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
      .innerJoin(orgs, eq(orgs.id, spaces.orgId))
      .where(eq(spaceMembers.userId, user.id))
      .orderBy(spaces.name);
  });

  app.get<{ Params: { spaceId: string } }>('/spaces/:spaceId', async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const membership = await resolveMembership(db, request.params.spaceId, user.id);
    if (!membership) return reply.code(404).send({ error: 'not_found' });

    const rows = await db
      .select({ id: spaces.id, name: spaces.name, slug: spaces.slug, map: spaces.map, mapVersion: spaces.mapVersion })
      .from(spaces)
      .where(eq(spaces.id, request.params.spaceId));
    const space = rows[0];
    if (!space) return reply.code(404).send({ error: 'not_found' });
    return { ...space, role: membership.role };
  });
}
