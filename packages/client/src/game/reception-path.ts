import { DIR_DELTA, DIRS, findPath, zoneAt, type Tile } from '@pixelwork/shared';
import type { ClientWorld } from '../net/client-world.ts';
import type { WorldTargets } from './world-actions.ts';

export function receptionPath(world: ClientWorld, targets: WorldTargets): Tile[] | null {
  const destination = world.receptionDestination;
  if (!destination) return null;
  const { map, self } = world;
  const canEnter: typeof world.canEnter = (from, x, y) => {
    const zone = zoneAt(map, x, y);
    return world.canEnter(from, x, y) && (zone.type === 'open' || zoneAt(map, from.x, from.y) === zone);
  };
  let path;
  if (destination.kind === 'person') {
    const player = world.players.get(destination.id);
    if (!player) return null;
    path = findPath(map, self, player, { canEnter, stopAt: 1 });
  } else if (destination.kind === 'desk') {
    const desk = map.desks.find(({ key }) => key === destination.key);
    if (!desk) return null;
    path = findPath(map, self, { x: desk.chairX, y: desk.chairY }, { canEnter });
  } else {
    const zone = map.zones.find(({ key }) => key === destination.key);
    if (!zone) return null;
    const approaches = targets.flatMap((target) => target.kind === 'door' && target.zoneKey === zone.key ? target.outside : []);
    path = findPath(map, self, self, { canEnter, goal: (x, y) => {
      if (zone.type === 'open') return zoneAt(map, x, y) === zone;
      if (approaches.length) return approaches.some((tile) => tile.x === x && tile.y === y);
      return zoneAt(map, x, y).type === 'open' && DIRS.some((dir) => {
        const [dx, dy] = DIR_DELTA[dir];
        return zoneAt(map, x + dx, y + dy) === zone;
      });
    } });
  }
  if (!path) return null;
  let { x, y } = self;
  return [{ x, y }, ...path.map((dir) => {
    const [dx, dy] = DIR_DELTA[dir];
    x += dx;
    y += dy;
    return { x, y };
  })];
}
