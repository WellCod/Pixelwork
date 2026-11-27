import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESK_DEFAULT_DECOR_PROPERTY, DeskDecor, TILE_PX, compileMap, frameOf, isWalkable } from '@pixelwork/shared';
import { apply, objectLayer, placeFurniture, propertyValue, type TiledDoc, type TilesetRef } from '@pixelwork/shared/editor';
import { orgs, spaces } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { Db, Tx } from './db.ts';
import { uuidv7 } from './ids.ts';
import { withAuroraConferenceTable } from './demo-aurora.ts';
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

/** Monta o balcão na ponta direita do corredor e reaproveita o ponto da recepção ao atualizar a demo. */
export function withDemoReception(original: TiledDoc): TiledDoc {
  const seat = { x: 35, y: 12 };
  const left = seat.x - 1;
  const bottom = seat.y + 2;
  const tileset = 'furniture-3x2';
  const frame = frameOf(tileset, 'reception');
  const reference = (original.tilesets as TilesetRef[] | undefined)?.find(({ source }) => source === `${tileset}.tsj`);
  const hasCounter = reference && objectLayer(original, 'furniture').objects.some((object) =>
    object.gid === reference.firstgid + frame && object.x === left * TILE_PX && object.y === (bottom + 1) * TILE_PX);
  let map = original;
  if (!hasCounter) {
    const compiled = compileMap(map);
    if (!compiled.ok || [bottom - 1, bottom].some((y) =>
      [left, left + 1, left + 2].some((x) => !isWalkable(compiled.map, x, y)))) {
      throw new Error('Espaço do balcão da recepção ocupado.');
    }
    const counter = placeFurniture(map, tileset, frame, left, bottom);
    if (!counter) throw new Error('Balcão da recepção fora dos limites da demo.');
    map = apply(map, counter).doc;
  }
  const nextLayerId = map.nextlayerid;
  const nextObjectId = map.nextobjectid;
  if (typeof nextLayerId !== 'number' || nextObjectId === undefined) throw new Error('IDs do mapa padrão ausentes.');
  const layer = map.layers.find((entry) => entry.name === 'reception');
  const existing = layer?.type === 'objectgroup' ? layer.objects[0] : undefined;
  const point = {
    id: existing?.id ?? nextObjectId, name: 'Recepção', type: '', point: true,
    x: (seat.x + 0.5) * TILE_PX, y: (seat.y + 0.5) * TILE_PX,
    width: 0, height: 0, visible: true, rotation: 0,
    properties: [
      ...(existing?.properties ?? []).filter(({ name }) => name !== 'seated'),
      { name: 'seated', type: 'bool', value: true },
    ],
  };
  return {
    ...map,
    nextlayerid: layer ? nextLayerId : nextLayerId + 1,
    nextobjectid: existing ? nextObjectId : nextObjectId + 1,
    layers: layer ? map.layers.map((entry) => entry === layer ? { ...entry, objects: [point] } : entry) : [...map.layers, {
      id: nextLayerId, name: 'reception', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, visible: true, opacity: 1,
      objects: [point],
    }],
  };
}

/** Mapa usado na criação e no reset da demo. */
export function loadDemoTemplate(): TiledDoc {
  const template = withDemoDeskDecor(loadTemplate('small-office') as TiledDoc);
  return withDemoReception(withAuroraConferenceTable(withDemoHolidayArea(template)));
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
