import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireUser, type AuthDeps } from '../auth/routes.ts';
import type { SessionUser } from '../auth/sessions.ts';
import { findDemoSpaceId } from '../demo.ts';
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
  const membership = await resolveMembership(deps.db, request.params.spaceId, user.id);
  if (!membership) {
    await reply.code(404).send({ error: 'not_found' });
    return null;
  }
  // O id que segue para as consultas é o validado pela resolução, nunca o parâmetro cru.
  return { user, membership, spaceId: membership.spaceId };
}

/** Membros da demo podem editar seu mapa sem ganhar permissões de administrador. */
export async function canEditSpaceMap(deps: AuthDeps, membership: Membership): Promise<boolean> {
  if (membership.role === 'admin') return true;
  return membership.spaceId === await findDemoSpaceId(deps.db, deps.config.demoSpaceSlug);
}
