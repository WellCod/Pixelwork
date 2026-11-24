import { TILESETS, TILE_PX, compileMap, frameOf, isWalkable } from '@pixelwork/shared';
import { apply, objectLayer, paintRug, placeFurniture, propertyValue, type TiledDoc, type TilesetRef } from '@pixelwork/shared/editor';

const TITLE = 'Natal do Grinch';
const DECOR = [
  { tileset: 'furniture-2x2-christmas', item: 'christmas-room-tree', dx: 9, dy: 1 },
  { tileset: 'furniture-christmas', item: 'christmas-room-max', dx: 9, dy: 3 },
  { tileset: 'furniture-christmas', item: 'christmas-room-gifts', dx: 10, dy: 4 },
] as const;

/** Decora a primeira fileira de Produto, usando o mesmo formato e comandos do editor. */
export function withDemoHolidayArea(map: TiledDoc): TiledDoc {
  const zone = objectLayer(map, 'zones').objects.find((object) => propertyValue(object, 'zone_key') === 'produto');
  if (!zone || zone.width < 11 * TILE_PX || zone.height < 5 * TILE_PX) return map;
  const compiled = compileMap(map);
  if (!compiled.ok) throw new Error('mapa da demo inválido antes da montagem de Natal');

  const left = zone.x / TILE_PX;
  const top = zone.y / TILE_PX;
  const rug = paintRug(map, 'sage', left, top, left + 10, top + 4);
  let decorated = rug ? apply(map, rug).doc : map;
  if (propertyValue(zone, 'name') !== TITLE) {
    const properties = (zone.properties ?? []).filter((property) => property.name !== 'name');
    decorated = apply(decorated, {
      kind: 'replaceObject', layer: 'zones',
      object: { ...zone, properties: [...properties, { name: 'name', type: 'string', value: TITLE }] },
    }).doc;
  }

  for (const { tileset, item, dx, dy } of DECOR) {
    const x = left + dx;
    const y = top + dy;
    const frame = frameOf(tileset, item);
    const reference = ((decorated.tilesets as TilesetRef[] | undefined) ?? []).find(({ source }) => source === `${tileset}.tsj`);
    const objects = objectLayer(decorated, 'furniture').objects;
    if (reference && objects.some((object) =>
      object.gid === reference.firstgid + frame && object.x === x * TILE_PX && object.y === (y + 1) * TILE_PX)) continue;

    const { tileWidth, tileHeight } = TILESETS[tileset];
    const bounds = { left: x * TILE_PX, right: x * TILE_PX + tileWidth, bottom: (y + 1) * TILE_PX };
    const topPx = bounds.bottom - tileHeight;
    const overlaps = objects.some((object) => {
      const width = object.width > 0 ? object.width : TILE_PX;
      const height = object.height > 0 ? object.height : TILE_PX;
      return object.x < bounds.right && object.x + width > bounds.left && object.y > topPx && object.y - height < bounds.bottom;
    });
    if (overlaps) continue;

    const { desks, spawn } = compiled.map;
    const clear = Array.from({ length: (tileWidth / TILE_PX) * (tileHeight / TILE_PX) }, (_, index) => {
      const tilesWide = tileWidth / TILE_PX;
      return [x + index % tilesWide, topPx / TILE_PX + Math.floor(index / tilesWide)] as const;
    }).every(([tileX, tileY]) => isWalkable(compiled.map, tileX, tileY)
      && (spawn.x !== tileX || spawn.y !== tileY)
      && !desks.some((desk) => desk.chairX === tileX && desk.chairY === tileY));
    if (!clear) continue;

    const placement = placeFurniture(decorated, tileset, frame, x, y);
    if (placement) decorated = apply(decorated, placement).doc;
  }
  return decorated;
}
