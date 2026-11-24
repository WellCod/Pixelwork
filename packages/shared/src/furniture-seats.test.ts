import { describe, expect, it } from 'vitest';
import { frameOf } from './assets.ts';
import { canReachFurnitureSeat } from './furniture-seats.ts';
import { compileMap, isWalkable } from './map.ts';
import { buildTestMap } from './testing.ts';

describe('assentos de móveis', () => {
  it('usa as almofadas do sofá e descarta acessos bloqueados ou numa zona vizinha', () => {
    const tileset = 'furniture-2x1';
    const result = compileMap(buildTestMap({
      furniture: [{ tileset, tile: frameOf(tileset, 'sofa-peach'), x: 3, y: 3, w: 2 }],
      zones: [{ key: 'sala', type: 'meeting', x: 3, y: 3, w: 1, h: 1 }],
    }));
    if (!result.ok) throw new Error('mapa de teste inválido');
    expect(result.map.furnitureSeats).toMatchObject([{ key: 'sofa-peach@3,3:1', facing: 'down', approaches: [[4, 4]] }]);
    expect(isWalkable(result.map, 4, 3)).toBe(false);
    expect(isWalkable(result.map, 4, 4)).toBe(true);
  });

  it('tem uma cadeira em cada lado da mesa redonda, com a orientação voltada ao tampo', () => {
    const tileset = 'furniture-2x2';
    const result = compileMap(buildTestMap({
      furniture: [{ tileset, tile: frameOf(tileset, 'meeting-table-round'), x: 4, y: 4, w: 2, h: 2 }],
      walls: [[3, 3]],
    }));
    if (!result.ok) throw new Error('mapa de teste inválido');
    expect(result.map.furnitureSeats.map(({ facing, approaches }) => [facing, approaches])).toEqual([
      ['down', [[4, 2], [5, 2]]], ['up', [[4, 5], [5, 5]]], ['right', [[3, 4]]], ['left', [[6, 3], [6, 4]]],
    ]);
    expect(result.map.furnitureSeats.some((seat) => canReachFurnitureSeat(seat, 3, 4))).toBe(true);
    expect(result.map.furnitureSeats.some((seat) => canReachFurnitureSeat(seat, 4, 4))).toBe(false);
  });
});
