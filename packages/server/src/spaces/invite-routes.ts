import { randomBytes } from 'node:crypto';
import { invites, orgs, spaceMembers, spaces } from '@pixelwork/shared/schema';
import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import { hashToken } from '../auth/sessions.ts';
import { isUniqueViolation, parseBody } from '../http.ts';
import { isUuid } from '../ids.ts';
import { requireMember, type SpaceParams } from './access.ts';

const InviteBody = z.object({
  role: z.enum(['admin', 'member']).default('member'),
  expiresInHours: z.number().int().min(1).max(720).default(168),
  maxUses: z.number().int().min(1).max(1000).nullable().default(null),
});

type InviteRow = {
  spaceId: string;
  role: 'admin' | 'member';
  expiresAt: Date;
  usesLeft: number | null;
};

/** 404 inexistente, 410 expirado ou sem usos: o mesmo critério na prévia e no aceite. */
function inviteProblem(invite: InviteRow | undefined, now: Date): { status: number; error: string } | null {
  if (!invite) return { status: 404, error: 'not_found' };
  if (invite.expiresAt <= now) return { status: 410, error: 'invite_expired' };
  if (invite.usesLeft !== null && invite.usesLeft <= 0) return { status: 410, error: 'invite_used_up' };
  return null;
}

export function registerInviteRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db, config, clock } = deps;

  const findInvite = async (token: string) =>
    (
      await db
        .select({
          spaceId: invites.spaceId,
          role: invites.role,
          expiresAt: invites.expiresAt,
          usesLeft: invites.usesLeft,
          spaceName: spaces.name,
          orgName: orgs.name,
        })
        .from(invites)
        .innerJoin(spaces, eq(spaces.id, invites.spaceId))
        .innerJoin(orgs, eq(orgs.id, spaces.orgId))
        .where(eq(invites.tokenHash, hashToken(token)))
    )[0];

  app.post<{ Params: SpaceParams }>('/spaces/:spaceId/invites', async (request, reply) => {
    const access = await requireMember(deps, request, reply);
    if (!access) return reply;
    if (access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
    const body = await parseBody(InviteBody, request, reply);
    if (!body) return reply;

    // Só o hash vai para o banco: vazar a tabela não entrega convites válidos.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(clock.now() + body.expiresInHours * 3_600_000);
    await db.insert(invites).values({
      tokenHash: hashToken(token),
      spaceId: access.spaceId,
      role: body.role,
      expiresAt,
      usesLeft: body.maxUses,
    });
    const url = `${new URL(config.publicUrl).origin}/invite/${token}`;
    return reply.code(201).send({ url, expiresAt, role: body.role, maxUses: body.maxUses });
  });

  app.get<{ Params: { token: string } }>('/invites/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const invite = await findInvite(request.params.token);
    const problem = inviteProblem(invite, new Date(clock.now()));
    if (problem || !invite) return reply.code(problem?.status ?? 404).send({ error: problem?.error ?? 'not_found' });
    const member = await db
      .select({ role: spaceMembers.role })
      .from(spaceMembers)
      .where(and(eq(spaceMembers.spaceId, invite.spaceId), eq(spaceMembers.userId, user.id)));
    return {
      spaceId: invite.spaceId,
      spaceName: invite.spaceName,
      orgName: invite.orgName,
      role: invite.role,
      alreadyMember: member.length > 0,
    };
  });

  app.post<{ Params: { token: string } }>('/invites/:token/accept', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    if (!user) return reply;
    const now = new Date(clock.now());
    const invite = await findInvite(request.params.token);
    // Já membro tem precedência sobre expirado ou esgotado: é o que a pessoa precisa saber.
    if (invite) {
      const member = await db
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, invite.spaceId), eq(spaceMembers.userId, user.id)));
      if (member.length > 0) return reply.code(409).send({ error: 'already_member' });
    }
    const problem = inviteProblem(invite, now);
    if (problem || !invite) return reply.code(problem?.status ?? 404).send({ error: problem?.error ?? 'not_found' });

    const accept = () => db.transaction(async (tx) => {
      const member = await tx
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, invite.spaceId), eq(spaceMembers.userId, user.id)));
      // Quem já é membro não gasta um uso do convite.
      if (member.length > 0) return 'already_member' as const;
      // Decremento condicional: dois aceites simultâneos não passam do limite.
      const taken = await tx
        .update(invites)
        .set({ usesLeft: sql`${invites.usesLeft} - 1` })
        .where(
          and(
            eq(invites.tokenHash, hashToken(request.params.token)),
            gt(invites.expiresAt, now),
            or(isNull(invites.usesLeft), gt(invites.usesLeft, 0)),
          ),
        )
        .returning({ usesLeft: invites.usesLeft });
      if (taken.length === 0) return 'invite_used_up' as const;
      await tx.insert(spaceMembers).values({ spaceId: invite.spaceId, userId: user.id, role: invite.role });
      return 'ok' as const;
    });
    // Dois aceites do mesmo usuário ao mesmo tempo: o segundo bate na chave primária.
    const result = await accept().catch((error: unknown) => {
      if (isUniqueViolation(error)) return 'already_member' as const;
      throw error;
    });

    if (result === 'already_member') return reply.code(409).send({ error: 'already_member' });
    if (result === 'invite_used_up') return reply.code(410).send({ error: 'invite_used_up' });
    return reply.code(201).send({ spaceId: invite.spaceId, role: invite.role });
  });

  app.delete<{ Params: SpaceParams & { userId: string } }>(
    '/spaces/:spaceId/members/:userId',
    async (request, reply) => {
      const access = await requireMember(deps, request, reply);
      if (!access) return reply;
      const { userId } = request.params;
      const self = userId === access.user.id;
      if (!self && access.membership.role !== 'admin') return reply.code(403).send({ error: 'admin_only' });
      if (!isUuid(userId)) return reply.code(404).send({ error: 'not_found' });

      // Coworking sem admin ninguém edita nem convida: o último admin não sai nem é removido.
      // A contagem e a remoção ficam na mesma transação, com a linha dos admins travada.
      const outcome = await db.transaction(async (tx) => {
        const admins = await tx
          .select({ userId: spaceMembers.userId })
          .from(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, access.spaceId), eq(spaceMembers.role, 'admin')))
          .for('update');
        if (admins.length === 1 && admins[0]?.userId === userId) return 'last_admin' as const;
        // A FK composta de desk_assignments libera a mesa junto.
        const removed = await tx
          .delete(spaceMembers)
          .where(and(eq(spaceMembers.spaceId, access.spaceId), eq(spaceMembers.userId, userId)))
          .returning({ userId: spaceMembers.userId });
        return removed.length === 0 ? ('not_found' as const) : ('removed' as const);
      });
      if (outcome === 'last_admin') return reply.code(409).send({ error: 'last_admin' });
      if (outcome === 'not_found') return reply.code(404).send({ error: 'not_found' });
      app.realtime.runtime(access.spaceId)?.removeMember(userId);
      return reply.code(204).send();
    },
  );
}
