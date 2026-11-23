import { randomInt } from 'node:crypto';
import { AvatarSpec, randomAvatar } from '@pixelwork/shared';
import { spaceMembers, users } from '@pixelwork/shared/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.ts';
import { parseCookies, serializeCookie } from '../cookies.ts';
import type { Db } from '../db.ts';
import { findDemoSpaceId } from '../demo.ts';
import { uuidv7 } from '../ids.ts';
import type { Clock } from '../realtime/clock.ts';
import {
  GUEST_SESSION_MS,
  SESSION_COOKIE,
  createSession,
  deleteSession,
  findSessionUser,
  hashToken,
  type SessionUser,
} from './sessions.ts';

export interface AuthDeps {
  db: Db;
  config: AppConfig;
  clock: Clock;
}

export interface Me {
  id: string;
  name: string;
  avatar: AvatarSpec;
  isGuest: boolean;
}

const toMe = (user: SessionUser): Me => ({
  id: user.id,
  name: user.displayName,
  avatar: AvatarSpec.parse(user.avatar),
  isGuest: user.isGuest,
});

/** Usuário da sessão ou 401 já respondido. */
export async function requireUser(
  deps: AuthDeps,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<SessionUser | null> {
  const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
  const user = await findSessionUser(deps.db, token, new Date(deps.clock.now()));
  if (!user) await reply.code(401).send({ error: 'unauthenticated' });
  return user;
}

/** Entrada como convidado na demo, sessão atual e logout. */
export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  const { db, config, clock } = deps;

  app.post('/auth/guest', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (_request, reply) => {
    const spaceId = await findDemoSpaceId(db, config.demoSpaceSlug);
    if (!spaceId) return reply.code(503).send({ error: 'demo_unavailable' });

    const now = clock.now();
    const expiresAt = new Date(now + GUEST_SESSION_MS);
    const user: SessionUser = {
      id: uuidv7(now),
      displayName: `Visitante ${String(randomInt(10_000)).padStart(4, '0')}`,
      avatar: randomAvatar(),
      isGuest: true,
    };
    // Usuário, vaga na demo e sessão juntos: falha no meio não deixa convidado órfão.
    const token = await db.transaction(async (tx) => {
      await tx.insert(users).values({ ...user, guestExpiresAt: expiresAt });
      await tx.insert(spaceMembers).values({ spaceId, userId: user.id, role: 'member' });
      return createSession(tx, user.id, expiresAt);
    });

    void reply.header(
      'set-cookie',
      serializeCookie(SESSION_COOKIE, token, {
        maxAgeSeconds: GUEST_SESSION_MS / 1000,
        secure: config.cookieSecure,
      }),
    );
    return reply.code(201).send(toMe(user));
  });

  app.get('/me', async (request, reply) => {
    const user = await requireUser(deps, request, reply);
    return user ? toMe(user) : reply;
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) {
      await deleteSession(db, token);
      // Derruba também os WebSockets abertos com esta sessão, em qualquer coworking.
      app.realtime.closeSession(hashToken(token));
    }
    void reply.header(
      'set-cookie',
      serializeCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0, secure: config.cookieSecure }),
    );
    return reply.code(204).send();
  });
}
