import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESK_DEFAULT_DECOR_PROPERTY, DeskDecor } from '@pixelwork/shared';
import { propertyValue, type TiledDoc } from '@pixelwork/shared/editor';
import { orgs, spaces } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from './db.ts';
import { uuidv7 } from './ids.ts';
import { withDemoHolidayArea } from './demo-holiday-area.ts';

export const DEMO_ORG_SLUG = 'demo';

/** Mapa modelo de maps/templates (sem validação: quem usa valida com o schema do mapa). */
export function loadTemplate(name: string): unknown {
  return JSON.parse(readFileSync(join(import.meta.dirname, '../../../maps/templates', `${name}.json`), 'utf8'));
}

/** Aplica a montagem da demo aos objetos de mesa pelas suas chaves no mapa. */
export function withDemoDeskDecor(map: TiledDoc): TiledDoc {
  const raw: unknown = JSON.parse(readFileSync(join(import.meta.dirname, '../../../maps/templates/demo-desk-decor.json'), 'utf8'));
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('decoração da demo inválida');
  const defaults = new Map(Object.entries(raw).map(([key, value]) => [key, DeskDecor.parse(value)]));

  return {
    ...map,
    layers: map.layers.map((layer) => {
      if (layer.name !== 'desks' || layer.type !== 'objectgroup') return layer;
      return { ...layer, objects: layer.objects.map((object) => {
        const key = propertyValue(object, 'desk_key');
        const decor = typeof key === 'string' ? defaults.get(key) : undefined;
        if (!decor) return object;
        const properties = (object.properties ?? []).filter((property) => property.name !== DESK_DEFAULT_DECOR_PROPERTY);
        return { ...object, properties: [...properties, { name: DESK_DEFAULT_DECOR_PROPERTY, type: 'string', value: JSON.stringify(decor) }] };
      }) };
    }),
  };
}

/** Mapa usado na criação e no reset da demo. */
export function loadDemoTemplate(): TiledDoc {
  return withDemoHolidayArea(withDemoDeskDecor(loadTemplate('small-office') as TiledDoc));
}

/** Cria a org Demo e o coworking de demonstração; não mexe no que já existe. */
export async function seedDemo(db: Db, spaceSlug: string, map: unknown): Promise<string> {
  await db
    .insert(orgs)
    .values({ id: uuidv7(), name: 'Demo', slug: DEMO_ORG_SLUG })
    .onConflictDoNothing({ target: orgs.slug });
  // O insert pode ter sido ignorado pelo conflito, então o id vem sempre de uma leitura.
  const orgRows = await db.select({ id: orgs.id }).from(orgs).where(eq(orgs.slug, DEMO_ORG_SLUG));
  const orgId = orgRows[0]?.id;
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

/** Id do coworking de demo pelo slug, sempre dentro da org Demo. */
export async function findDemoSpaceId(db: Db | Tx, spaceSlug: string): Promise<string | null> {
  const rows = await db
    .select({ id: spaces.id })
    .from(spaces)
    .innerJoin(orgs, eq(orgs.id, spaces.orgId))
    .where(and(eq(orgs.slug, DEMO_ORG_SLUG), eq(spaces.slug, spaceSlug)));
  return rows[0]?.id ?? null;
}
