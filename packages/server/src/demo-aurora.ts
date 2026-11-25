import { TILE_PX, compileMap, frameOf, isWalkable, zoneAt } from '@pixelwork/shared';
import { apply, objectLayer, placeFurniture, type TiledDoc, type TilesetRef } from '@pixelwork/shared/editor';

const ROOM = 'sala-aurora';
const TABLE = 'meeting-table-conference';
const TILESET = 'furniture-5x2';

/** Reaproveita o lugar da mesa anterior e preserva o restante do mapa editado na demo. */
export function withAuroraConferenceTable(map: TiledDoc): TiledDoc {
  const compiled = compileMap(map);
  if (!compiled.ok) return map;
  const { map: roomMap } = compiled;
  const oldTileset = (map.tilesets as TilesetRef[]).find(({ source }) => source === 'furniture-3x2.tsj');
  if (!oldTileset) return map;
  const oldGid = oldTileset.firstgid + frameOf('furniture-3x2', 'meeting-table-long');
  const { objects } = objectLayer(map, 'furniture');
  const table = objects.find((object) => object.gid === oldGid
    && zoneAt(roomMap, object.x / TILE_PX, object.y / TILE_PX - 1).key === ROOM);
  if (!table) return map;

  const left = table.x / TILE_PX - 1;
  const bottom = table.y / TILE_PX - 1;
  const edgeColumns = [left, left + 4];
  const clear = edgeColumns.every((x) => [bottom - 1, bottom].every((y) =>
    zoneAt(roomMap, x, y).key === ROOM && isWalkable(roomMap, x, y)
    && !roomMap.desks.some((desk) => desk.chairX === x && desk.chairY === y)
    && (roomMap.spawn.x !== x || roomMap.spawn.y !== y)));
  if (!clear) return map;

  const placement = placeFurniture(map, TILESET, frameOf(TILESET, TABLE), left, bottom);
  if (!placement) return map;
  const placedDoc = apply(map, placement).doc;
  const placed = objectLayer(placedDoc, 'furniture').objects.at(-1);
  if (placed?.gid === undefined) return map;
  const { gid, x, y, width, height } = placed;
  const overlaps = objects.some((object) => object.id !== table.id
    && object.x < x + width && object.x + (object.width || TILE_PX) > x
    && object.y > y - height && object.y - (object.height || TILE_PX) < y);
  if (overlaps) return map;

  const expanded = apply({ ...map, tilesets: placedDoc.tilesets }, {
    kind: 'replaceObject', layer: 'furniture', object: { ...table, gid, x, y, width, height },
  }).doc;
  const validation = compileMap(expanded);
  const seatPrefix = `${TABLE}@${left},${bottom - 1}:`;
  return validation.ok && validation.map.furnitureSeats.filter(({ key }) => key.startsWith(seatPrefix)).length === 10
    ? expanded : map;
}
