import { createHash, randomBytes } from 'node:crypto';
import { sessions, users } from '@pixelwork/shared/schema';
import { and, eq, gt } from 'drizzle-orm';
import type { Db, Tx } from '../db.ts';

export const SESSION_COOKIE = 'sid';
export const ACCOUNT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const GUEST_SESSION_MS = 24 * 60 * 60 * 1000;

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

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
