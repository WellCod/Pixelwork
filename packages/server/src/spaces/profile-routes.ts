import { AvatarSpec, NameBody, StatusBody, TitleBody } from '@pixelwork/shared';
import { spaceMembers, users } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import { parseBody } from '../http.ts';
import { isUuid } from '../ids.ts';
import { requireMember, type SpaceParams } from './access.ts';

/**
 * Perfil do usuário (avatar e nome, globais) e da participação (status e cargo, por coworking).
 * Toda alteração gravada também vai para quem está online no mapa.
 */
export function registerProfileRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;
  // Lido na hora da requisição: o gateway é decorado no app depois do registro das rotas.
  const gateway = () => app.realtime;

  app.put('/me/avatar', async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const avatar = await parseBody(AvatarSpec, request, reply);
    if (!avatar) return reply;
    await db.update(users).set({ avatar }).where(eq(users.id, user.id));
    gateway().forEachRuntime((runtime) => runtime.updateProfile(user.id, { avatar }));
    return { avatar };
  });

  app.put('/me/name', async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const body = await parseBody(NameBody, request, reply);
    if (!body) return reply;
    await db.update(users).set({ displayName: body.name }).where(eq(users.id, user.id));
    gateway().forEachRuntime((runtime) => runtime.updateProfile(user.id, { name: body.name }));
    return { name: body.name };
  });

  app.put<{ Params: SpaceParams }>('/spaces/:spaceId/me/status', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    const body = await parseBody(StatusBody, request, reply);
    if (!body) return reply;
    const patch = { status: body.status, statusText: body.text, statusEmoji: body.emoji };
    await db
      .update(spaceMembers)
      .set(patch)
      .where(and(eq(spaceMembers.spaceId, access.spaceId), eq(spaceMembers.userId, access.user.id)));
    gateway().runtime(access.spaceId)?.updateProfile(access.user.id, patch);
    return patch;
  });

  app.put<{ Params: SpaceParams }>('/spaces/:spaceId/me/title', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    const body = await parseBody(TitleBody, request, reply);
    if (!body) return reply;
    await db
      .update(spaceMembers)
      .set({ title: body.title })
      .where(and(eq(spaceMembers.spaceId, access.spaceId), eq(spaceMembers.userId, access.user.id)));
    gateway().runtime(access.spaceId)?.updateProfile(access.user.id, { title: body.title });
    return { title: body.title };
  });

  app.put<{ Params: SpaceParams & { userId: string } }>(
    '/spaces/:spaceId/members/:userId/title',
    async (request, reply) => {
      const access = await requireMember(deps, request, reply);
      if (!access) return reply;
      if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
      const body = await parseBody(TitleBody, request, reply);
      if (!body) return reply;
      const { userId } = request.params;
      // O update filtra pelo coworking validado: admin de um coworking não mexe em membro de outro.
      if (!isUuid(userId)) return reply.code(404).send({ error: 'not_found' });
      const updated = await db
        .update(spaceMembers)
        .set({ title: body.title })
        .where(and(eq(spaceMembers.spaceId, access.spaceId), eq(spaceMembers.userId, userId)))
        .returning({ userId: spaceMembers.userId });
      if (updated.length === 0) return reply.code(404).send({ error: 'not_found' });
      gateway().runtime(access.spaceId)?.updateProfile(userId, { title: body.title });
      return { title: body.title };
    },
  );
}
