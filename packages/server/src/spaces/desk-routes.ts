import { DESK_VARIANTS, DeskDecor, type DeskState } from '@pixelwork/shared';
import { deskAssignments } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AuthDeps } from '../auth/routes.ts';
import { isUniqueViolation, parseBody } from '../http.ts';
import { requireMember, type SpaceParams } from './access.ts';

type DeskParams = SpaceParams & { deskKey: string };

export const DEFAULT_DECOR: DeskDecor = {
  variant: DESK_VARIANTS[0],
  monitor: 'single',
  slots: { left: null, right: null, back: null, floor: null },
};

export function registerDeskRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db } = deps;

  const assignment = async (spaceId: string, deskKey: string) =>
    (
      await db
        .select({ userId: deskAssignments.userId })
        .from(deskAssignments)
        .where(and(eq(deskAssignments.spaceId, spaceId), eq(deskAssignments.deskKey, deskKey)))
    )[0];

  app.post<{ Params: DeskParams }>('/spaces/:spaceId/desks/:deskKey/claim', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    const { spaceId, user, membership } = access;
    const runtime = app.realtime.runtime(spaceId);
    const desk = runtime?.mapDesk(request.params.deskKey);
    if (!runtime || !desk) return reply.code(404).send({ error: 'not_found' });

    // A posição vem do servidor de tempo real; o cliente não informa onde está.
    const pos = runtime.positionOf(user.id);
    if (pos?.x !== desk.chairX || pos.y !== desk.chairY) {
      return reply.code(422).send({ error: 'not_on_chair' });
    }

    try {
      await db
        .insert(deskAssignments)
        .values({ spaceId, deskKey: desk.key, userId: user.id, decor: DEFAULT_DECOR });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const taken = await assignment(spaceId, desk.key);
      return reply.code(409).send({ error: taken ? 'desk_taken' : 'already_has_desk' });
    }

    const state: DeskState = {
      deskKey: desk.key,
      userId: user.id,
      ownerName: membership.profile.name,
      decor: DEFAULT_DECOR,
    };
    runtime.setDesk(state);
    return reply.code(201).send(state);
  });

  app.put<{ Params: DeskParams }>('/spaces/:spaceId/desks/:deskKey/decor', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    const decor = await parseBody(DeskDecor, request, reply);
    if (!decor) return reply;
    const { spaceId, user, membership } = access;
    const { deskKey } = request.params;

    const updated = await db
      .update(deskAssignments)
      .set({ decor })
      .where(
        and(
          eq(deskAssignments.spaceId, spaceId),
          eq(deskAssignments.deskKey, deskKey),
          eq(deskAssignments.userId, user.id),
        ),
      )
      .returning({ deskKey: deskAssignments.deskKey });
    if (updated.length === 0) {
      const current = await assignment(spaceId, deskKey);
      return reply.code(current ? 403 : 404).send({ error: current ? 'not_owner' : 'not_found' });
    }

    const state: DeskState = { deskKey, userId: user.id, ownerName: membership.profile.name, decor };
    app.realtime.runtime(spaceId)?.setDesk(state);
    return state;
  });

  app.delete<{ Params: DeskParams }>('/spaces/:spaceId/desks/:deskKey', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    const { spaceId, user, membership } = access;
    const { deskKey } = request.params;

    const current = await assignment(spaceId, deskKey);
    if (!current) return reply.code(404).send({ error: 'not_found' });
    if (current.userId !== user.id && membership.role !== 'admin') {
      return reply.code(403).send({ error: 'not_owner' });
    }
    await db
      .delete(deskAssignments)
      .where(and(eq(deskAssignments.spaceId, spaceId), eq(deskAssignments.deskKey, deskKey)));
    app.realtime.runtime(spaceId)?.setDesk({ deskKey, userId: null, ownerName: null, decor: null });
    return reply.code(204).send();
  });
}
