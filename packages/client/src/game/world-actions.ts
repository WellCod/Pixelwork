import {
  DIR_DELTA, TILESETS, TILE_PX, findPath, isWalkable, zoneAt,
  type ClientMsg, type CompiledMap, type CompiledTable, type Dir, type FurnitureSeat, type Tile,
} from '@pixelwork/shared';
import type { ClientWorld } from '../net/client-world.ts';
import { objectLayer, resolveGid } from './tiled.ts';

const DELTAS = Object.entries(DIR_DELTA) as [Dir, readonly [number, number]][];
const NEAR_STEPS = 4;
const SEAT_NAME = { sofa: 'Sentar no sofá', table: 'Sentar à mesa', stool: 'Sentar na banqueta' } as const;

interface Bounds extends Tile { width: number; height: number }
type Target = { id: string; bounds: Bounds; label: string; name: string } & (
  | { kind: 'seat'; seats: FurnitureSeat[] }
  | { kind: 'game'; table: CompiledTable }
  | { kind: 'door'; zoneKey: string; inside: Tile; outside: Tile[] }
  | { kind: 'aquarium' }
);
export type WorldTargets = ReturnType<typeof collectWorldTargets>;
type ActionMessage = Extract<ClientMsg, { t: 'furniture.sit' | 'game.join' | 'zone.knock' }>;
interface Spot { tile: Tile; message: ActionMessage }
interface Approach extends Spot { path: Dir[] }

const at = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const neighbors = ({ x, y }: Tile) => DELTAS.map(([, [dx, dy]]) => ({ x: x + dx, y: y + dy }));
const inBounds = (bounds: Bounds, { x, y }: Tile) => x >= bounds.x && y >= bounds.y
  && x < bounds.x + bounds.width && y < bounds.y + bounds.height;

/** A porta está no vão se ela ou um vizinho caminhável toca uma sala de reunião. */
export function meetingDoorZone(map: CompiledMap, tile: Tile) {
  if (!isWalkable(map, tile.x, tile.y)) return undefined;
  return [tile, ...neighbors(tile)].filter(({ x, y }) => isWalkable(map, x, y))
    .map(({ x, y }) => zoneAt(map, x, y)).find(({ type }) => type === 'meeting');
}

export function canKnockAt(map: CompiledMap, zoneKey: string, tile: Tile): boolean {
  return zoneAt(map, tile.x, tile.y).key !== zoneKey
    && neighbors(tile).some(({ x, y }) => zoneAt(map, x, y).key === zoneKey);
}

/** A arte fornece a pegada para toques. O mapa compilado fornece os pontos de interação válidos. */
export function collectWorldTargets(map: CompiledMap, mapJson: Record<string, unknown>): Target[] {
  const seatsByFurniture = new Map<string, FurnitureSeat[]>();
  for (const seat of map.furnitureSeats) {
    const id = seat.key.slice(0, seat.key.lastIndexOf(':'));
    const group = seatsByFurniture.get(id) ?? [];
    group.push(seat);
    seatsByFurniture.set(id, group);
  }
  const tables: Target[] = map.tables.map((table) => {
    const game = table.game === 'foosball' ? 'pebolim' : 'pingue-pongue';
    return { id: table.key, kind: 'game', bounds: table, table, label: `Jogar ${game}`, name: `Jogar ${game}` };
  });
  const targets = new Map(tables.map((table) => [table.id, table]));
  for (const object of objectLayer(mapJson, 'furniture')) {
    const tile = object.gid ? resolveGid(mapJson, object.gid) : null;
    if (!tile) continue;
    const set = TILESETS[tile.id];
    const item = set.items[tile.frame];
    const width = Math.max(1, Math.round((object.width || set.tileWidth) / TILE_PX));
    const height = Math.max(1, Math.round((object.height || set.tileHeight) / TILE_PX));
    const x = Math.floor(object.x / TILE_PX);
    const y = Math.ceil(object.y / TILE_PX) - height;
    const bounds = { x, y, width, height };
    const id = `${item}@${x},${y}`;
    if (item === 'aquarium') {
      targets.set(id, { id, kind: 'aquarium', bounds, label: 'Ver aquário', name: 'Ver aquário' });
    }
    const seats = seatsByFurniture.get(id);
    if (seats?.[0]) targets.set(id, { id, kind: 'seat', bounds, seats, label: 'Sentar', name: SEAT_NAME[seats[0].kind] });
    if (item !== 'door') continue;
    const zone = meetingDoorZone(map, bounds);
    if (!zone) continue;
    const around = [bounds, ...neighbors(bounds)].filter((spot) => isWalkable(map, spot.x, spot.y));
    const inside = around.find((spot) => zoneAt(map, spot.x, spot.y).key === zone.key);
    const outside = around.filter((spot) => canKnockAt(map, zone.key, spot));
    if (!inside || !outside.length) continue;
    targets.set(id, { id, kind: 'door', bounds, zoneKey: zone.key, inside, outside, label: 'Bater na porta', name: `Bater na porta de ${zone.name}` });
  }
  return [...targets.values()];
}

function availableSpots(world: ClientWorld, target: Target, occupied: ReadonlySet<string>): Spot[] {
  if (target.kind === 'aquarium') return [];
  if (target.kind === 'seat') {
    return target.seats.filter(({ key }) => !occupied.has(key)).flatMap(({ key, approaches }) =>
      approaches.map(([x, y]) => ({ tile: { x, y }, message: { t: 'furniture.sit', seatKey: key } })));
  }
  if (target.kind === 'game') {
    const state = world.tables.get(target.table.key);
    if (state?.phase === 'playing' || state?.phase === 'ended') return [];
    return (['left', 'right'] as const).filter((side) => !state?.[side]).flatMap((side) =>
      target.table.sides[side].map(([x, y]) => ({ tile: { x, y }, message: { t: 'game.join', tableKey: target.table.key } })));
  }
  if (!world.zones.get(target.zoneKey)?.locked || zoneAt(world.map, world.self.x, world.self.y).key === target.zoneKey) return [];
  return target.outside.filter((tile) => !world.canEnter(tile, target.inside.x, target.inside.y))
    .map((tile) => ({ tile, message: { t: 'zone.knock', zoneKey: target.zoneKey } }));
}

function occupiedSeats(world: ClientWorld): Set<string> {
  return new Set([...world.players.values()].flatMap(({ seatedAt }) => seatedAt ? [seatedAt] : []));
}

function closestApproach(world: ClientWorld, spots: Spot[], maxSteps = Infinity): Approach | null {
  let best: Approach | null = null;
  for (const spot of spots) {
    const { x, y } = spot.tile;
    const limit = best ? best.path.length - 1 : maxSteps;
    if (Math.abs(world.self.x - x) + Math.abs(world.self.y - y) > limit) continue;
    const path = findPath(world.map, world.self, spot.tile, { canEnter: world.canEnter });
    if (path && path.length <= limit) best = { ...spot, path };
  }
  return best;
}

export function nearbyActions(world: ClientWorld, targets: WorldTargets) {
  if (!world.selfId || world.seat || world.players.get(world.selfId)?.seatedAt) return [];
  const occupied = occupiedSeats(world);
  const actions = targets.flatMap((target) => {
    const approach = closestApproach(world, availableSpots(world, target, occupied), NEAR_STEPS);
    return approach ? [{ target, approach }] : [];
  }).sort((a, b) => a.approach.path.length - b.approach.path.length);
  const doors = new Set<string>();
  return actions.filter(({ target }) => {
    if (target.kind !== 'door') return true;
    if (doors.has(target.zoneKey)) return false;
    doors.add(target.zoneKey);
    return true;
  }).slice(0, 3);
}

/** Cliques no tampo ou na porta levam a um ponto de interação em vez do tile bloqueado. */
export function objectApproach(world: ClientWorld, targets: WorldTargets, tile: Tile): Dir[] | null {
  if (world.seat) return null;
  const blocked = !isWalkable(world.map, tile.x, tile.y);
  const target = targets.find((entry) => (entry.kind === 'door' || blocked) && inBounds(entry.bounds, tile));
  if (!target) return null;
  return closestApproach(world, availableSpots(world, target, occupiedSeats(world)))?.path ?? null;
}

export function aquariumAt(targets: WorldTargets, tile: Tile): boolean {
  return targets.some((target) => target.kind === 'aquarium' && inBounds(target.bounds, tile));
}

export function actionAt(world: ClientWorld, target: Target): ActionMessage | null {
  if (!world.selfId || world.seat || world.players.get(world.selfId)?.seatedAt) return null;
  const spots = availableSpots(world, target, occupiedSeats(world));
  if (!at(world.self, world.confirmed)) return null;
  return spots.find(({ tile }) => at(world.confirmed, tile))?.message ?? null;
}

/** Busca uma chegada caminhável dentro da área. Uma sala trancada pode levar à sua porta. */
export function destinationRoute(world: ClientWorld, targets: WorldTargets, zoneKey: string): { path: Dir[]; atDoor: boolean } | null {
  const { map, self } = world;
  const zoneIndex = map.zones.findIndex(({ key }) => key === zoneKey);
  if (zoneIndex < 1) return null;
  const inZone = (x: number, y: number) => map.zoneIndex[y * map.width + x] === zoneIndex;

  // Em uma área de jogos, tenta levar até um lado livre de uma mesa.
  const games = targets.filter((target) => target.kind === 'game' && inZone(target.bounds.x, target.bounds.y));
  const play = closestApproach(world, games.flatMap((game) => availableSpots(world, game, new Set()))
    .filter(({ tile }) => inZone(tile.x, tile.y)));
  if (play) return { path: play.path, atDoor: false };

  const tiles: Tile[] = [self];
  const visited = new Map<number, { prev: Tile; dir: Dir }>();
  const key = ({ x, y }: Tile) => y * map.width + x;
  for (const tile of tiles) {
    if (inZone(tile.x, tile.y)) {
      const path: Dir[] = [];
      for (let step = visited.get(key(tile)); step; step = visited.get(key(step.prev))) path.push(step.dir);
      return { path: path.reverse(), atDoor: false };
    }
    for (const [dir, [dx, dy]] of DELTAS) {
      const next = { x: tile.x + dx, y: tile.y + dy };
      if (!isWalkable(map, next.x, next.y) || at(self, next) || visited.has(key(next)) || !world.canEnter(tile, next.x, next.y)) continue;
      visited.set(key(next), { prev: tile, dir });
      tiles.push(next);
    }
  }
  const doors = targets.filter((target) => target.kind === 'door' && target.zoneKey === zoneKey);
  const door = closestApproach(world, doors.flatMap((target) => availableSpots(world, target, new Set())));
  return door ? { path: door.path, atDoor: true } : null;
}
