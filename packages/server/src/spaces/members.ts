import { AvatarSpec, type Player } from '@pixelwork/shared';
import { spaceMembers, users } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db.ts';
import { isUuid } from '../ids.ts';

export type PlayerProfile = Omit<Player, 'x' | 'y' | 'dir' | 'activity'>;

export interface Membership {
  role: 'admin' | 'member';
  profile: PlayerProfile;
}

/**
 * Resolução única de `space_members` para rotas e conexões (invariante 4).
 * Devolve null para não membro e para id malformado, sem distinguir os casos.
 */
export async function resolveMembership(db: Db, spaceId: unknown, userId: string): Promise<Membership | null> {
  if (!isUuid(spaceId)) return null;
  const rows = await db
    .select({
      role: spaceMembers.role,
      title: spaceMembers.title,
      status: spaceMembers.status,
      statusText: spaceMembers.statusText,
      statusEmoji: spaceMembers.statusEmoji,
      name: users.displayName,
      avatar: users.avatar,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(and(eq(spaceMembers.spaceId, spaceId), eq(spaceMembers.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    role: row.role,
    profile: {
      id: userId,
      name: row.name,
      title: row.title,
      avatar: AvatarSpec.parse(row.avatar),
      status: row.status,
      statusText: row.statusText,
      statusEmoji: row.statusEmoji,
    },
  };
}
