import { createHash, randomBytes } from 'node:crypto';
import { sessions, users } from '@pixelwork/shared/schema';
import { and, eq, gt } from 'drizzle-orm';
import type { Db, Tx } from '../db.ts';

export const SESSION_COOKIE = 'sid';
export const ACCOUNT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;

/** O banco guarda só o SHA-256 do token: um vazamento da tabela não dá sessões válidas. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Cria a sessão e devolve o token em claro, que só existe no cookie. */
export async function createSession(db: Db | Tx, userId: string, expiresAt: Date): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return token;
}

export interface SessionUser {
  id: string;
  displayName: string;
  avatar: unknown;
  isGuest: boolean;
}

export interface SessionInfo extends SessionUser {
  expiresAt: Date;
}

/** Usuário dono do token, se a sessão existir e não tiver expirado em `now`. */
export async function findSessionUser(
  db: Db,
  token: string | undefined,
  now: Date,
): Promise<SessionInfo | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatar: users.avatar,
      isGuest: users.isGuest,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}
