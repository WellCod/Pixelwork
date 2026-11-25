import { compileMap, DIR_DELTA, frameOf, zoneAt, type Dir, type Tile } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { ClientWorld } from '../net/client-world.ts';
import { receptionPath } from './reception-path.ts';
import { actionAt, canKnockAt, collectWorldTargets, destinationRoute, nearbyActions, objectApproach } from './world-actions.ts';

function office(x: number, y: number) {
  const json = buildTestMap({
    width: 15, height: 12,
    walls: [[7, 5], [8, 5], [10, 5], [11, 5], [12, 5]],
    zones: [
      { key: 'aurora', type: 'meeting', x: 7, y: 1, w: 6, h: 4 },
      { key: 'jogos', type: 'open', x: 1, y: 6, w: 8, h: 5 },
    ],
    furniture: [
      { x: 9, y: 5, tile: frameOf('furniture', 'door') },
      { x: 3, y: 8, w: 3, h: 2, tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'foosball') },
      { x: 10, y: 8, w: 2, tileset: 'furniture-2x1', tile: frameOf('furniture-2x1', 'sofa-peach') },
    ],
  });
  const compiled = compileMap(json);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
  const world = new ClientWorld(compiled.map);
  world.selfId = 'me';
  world.handle({ t: 'tick', ack: 0, moves: [['me', x, y, 'down']] });
  return { world, targets: collectWorldTargets(world.map, json) };
}

function arrive(start: Tile, route: Dir[]): Tile {
  return route.reduce<Tile>(({ x, y }, dir) => {
    const [dx, dy] = DIR_DELTA[dir];
    return { x: x + dx, y: y + dy };
  }, start);
}

describe('ações no mapa', () => {
  it('tocar no tampo leva ao lado livre do pebolim, sem oferecer o lado ocupado', () => {
    const { world, targets } = office(4, 6);
    const table = world.map.tables[0];
    if (!table) throw new Error('mesa de teste ausente');
    world.tables.set(table.key, { tableKey: table.key, phase: 'waiting', left: 'other', right: null, score: { left: 0, right: 0 } });
    const route = objectApproach(world, targets, { x: 4, y: 7 });
    expect(route).not.toBeNull();
    const arrival = arrive(world.self, route ?? []);
    expect(table.sides.right).toContainEqual([arrival.x, arrival.y]);
    expect(destinationRoute(world, targets, 'jogos')?.path).toEqual(route);
    world.handle({ t: 'tick', ack: 0, moves: [['me', arrival.x, arrival.y, 'down']] });
    const action = nearbyActions(world, targets).find(({ target }) => target.kind === 'game');
    expect(action && actionAt(world, action.target)).toEqual({ t: 'game.join', tableKey: table.key });
  });

  it('manda para fora da porta quando a sala está trancada e entra após a autorização', () => {
    const { world, targets } = office(9, 7);
    world.zones.set('aurora', { zoneKey: 'aurora', locked: true, occupants: ['other'] });
    const outside = destinationRoute(world, targets, 'aurora');
    expect(outside?.atDoor).toBe(true);
    const door = arrive(world.self, outside?.path ?? []);
    expect(door).toEqual({ x: 9, y: 5 });
    expect(canKnockAt(world.map, 'aurora', door)).toBe(true);
    world.handle({ t: 'tick', ack: 0, moves: [['me', door.x, door.y, 'down']] });
    const action = nearbyActions(world, targets).find(({ target }) => target.kind === 'door');
    expect(action && actionAt(world, action.target)).toEqual({ t: 'zone.knock', zoneKey: 'aurora' });
    world.handle({ t: 'zone.knockResult', zoneKey: 'aurora', allowed: true });
    const inside = destinationRoute(world, targets, 'aurora');
    expect(inside?.atDoor).toBe(false);
    const arrival = arrive(world.self, inside?.path ?? []);
    expect(zoneAt(world.map, arrival.x, arrival.y).key).toBe('aurora');
  });

  it('destaca o caminho da recepção até a porta e recalcula a partir da posição atual', () => {
    const { world, targets } = office(9, 7);
    world.handle({ t: 'reception.destination', destination: { kind: 'room', key: 'aurora', label: 'Aurora' } });
    expect(receptionPath(world, targets)).toEqual([{ x: 9, y: 7 }, { x: 9, y: 6 }, { x: 9, y: 5 }]);
    world.handle({ t: 'reception.session', state: 'ended', reason: 'left' });
    world.handle({ t: 'zone.state', zone: { zoneKey: 'aurora', locked: true, occupants: ['other'] } });
    world.handle({ t: 'tick', ack: 0, moves: [['me', 9, 6, 'up']] });
    expect(receptionPath(world, targets)).toEqual([{ x: 9, y: 6 }, { x: 9, y: 5 }]);
    world.clearReceptionDestination();
    expect(receptionPath(world, targets)).toBeNull();
  });

  it('leva ao piso em frente ao sofá e usa o assento daquele móvel', () => {
    const { world, targets } = office(10, 10);
    expect(objectApproach(world, targets, { x: 10, y: 8 })).toEqual(['up']);
    world.handle({ t: 'tick', ack: 0, moves: [['me', 10, 9, 'down']] });
    const action = nearbyActions(world, targets).find(({ target }) => target.kind === 'seat');
    expect(action && actionAt(world, action.target)).toEqual({ t: 'furniture.sit', seatKey: 'sofa-peach@10,8:0' });
  });
});
