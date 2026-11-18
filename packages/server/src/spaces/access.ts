import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { resolveMembership, type Membership } from './members.ts';

export interface SpaceParams {
  spaceId: string;
}

/**
 * Porta de entrada de toda rota `/spaces/:spaceId/...`: sessão e participação resolvidas
 * uma vez. Não membro recebe 404, sem revelar se o coworking existe.
 */
export async function requireMember(
  deps: AuthDeps,
  request: FastifyRequest<{ Params: SpaceParams }>,
  reply: FastifyReply,
): Promise<{ user: SessionUser; membership: Membership; spaceId: string } | null> {
  const user = await requireUser(deps, request, reply);
  if (!user) return null;
  const { spaceId } = request.params;
  const membership = await resolveMembership(deps.db, spaceId, user.id);
  if (!membership) {
    await reply.code(404).send({ error: 'not_found' });
    return null;
  }
  return { user, membership, spaceId };
}
