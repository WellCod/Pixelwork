import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { orgs, spaces } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from './db.ts';
import { uuidv7 } from './ids.ts';

export const DEMO_ORG_SLUG = 'demo';

export function loadTemplate(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, '../../../maps/templates', `${name}.json`), 'utf8'));
}

/** Cria a org Demo e o coworking de demonstração; não mexe no que já existe. */
export async function seedDemo(db: Db, spaceSlug: string, map: unknown): Promise<string> {
  await db
    .insert(orgs)
    .values({ id: uuidv7(), name: 'Demo', slug: DEMO_ORG_SLUG })
    .onConflictDoNothing({ target: orgs.slug });
  const org = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, DEMO_ORG_SLUG));
  const orgId = org[0]?.id;
  if (!orgId) throw new Error('org Demo não encontrada depois do insert');

  await db
    .insert(spaces)
    .values({ id: uuidv7(), orgId, name: 'Coworking Demo', slug: spaceSlug, map })
    .onConflictDoNothing({ target: [spaces.orgId, spaces.slug] });
  return findDemoSpaceId(db, spaceSlug).then((id) => {
    if (!id) throw new Error('coworking de demo não encontrado depois do insert');
    return id;
  });
}

export async function findDemoSpaceId(db: Db | Tx, spaceSlug: string): Promise<string | null> {
  const rows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(orgs, eq(orgs.id, spaces.orgId))
    .where(and(eq(orgs.slug, DEMO_ORG_SLUG), eq(spaces.slug, spaceSlug)));
  return rows[0]?.id ?? null;
}
