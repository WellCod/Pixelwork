import { DIR_DELTA, DIRS, findPath, zoneAt, type ReceptionDestination, type Tile } from '@pixelwork/shared';
import type { ClientWorld } from '../net/client-world.ts';
import type { WorldTargets } from './world-actions.ts';

export function destinationSteps(world: ClientWorld, targets: WorldTargets, destination: ReceptionDestination | (Tile & { kind: 'reception' })) {
  const { map, self } = world;
  const canEnter: typeof world.canEnter = (from, x, y) => {
    const zone = zoneAt(map, x, y);
    return world.canEnter(from, x, y) && (zone.type === 'open' || zoneAt(map, from.x, from.y) === zone);
  };
  if (destination.kind === 'reception') return findPath(map, self, destination, { canEnter, stopAt: 1 });
  if (destination.kind === 'person') {
    const player = world.players.get(destination.id);
    if (!player || player.activity === 'call' || player.activity === 'meeting' || zoneAt(map, player.x, player.y).type !== 'open') return null;
    return findPath(map, self, player, { canEnter, stopAt: 1 });
  }
  if (destination.kind === 'desk') {
    const desk = map.desks.find(({ key }) => key === destination.key);
    return desk ? findPath(map, self, { x: desk.chairX, y: desk.chairY }, { canEnter }) : null;
  }
  const zone = map.zones.find(({ key }) => key === destination.key);
  if (!zone) return null;
  if (zone.type === 'open') return findPath(map, self, self, { canEnter, goal: (x, y) => zoneAt(map, x, y) === zone });
  const approaches = targets.flatMap((target) => target.kind === 'door' && target.zoneKey === zone.key ? target.outside : []);
  return findPath(map, self, self, { canEnter, goal: (x, y) => {
    if (approaches.length) return approaches.some((tile) => tile.x === x && tile.y === y);
    return zoneAt(map, x, y).type === 'open' && DIRS.some((dir) => {
      const [dx, dy] = DIR_DELTA[dir];
      return zoneAt(map, x + dx, y + dy) === zone;
    });
  } });
}

export function receptionPath(world: ClientWorld, targets: WorldTargets): Tile[] | null {
  if (!world.receptionDestination) return null;
  const path = destinationSteps(world, targets, world.receptionDestination);
  if (!path) return null;
  let { x, y } = world.self;
  return [{ x, y }, ...path.map((dir) => {
    const [dx, dy] = DIR_DELTA[dir];
    x += dx;
    y += dy;
    return { x, y };
  })];
}
