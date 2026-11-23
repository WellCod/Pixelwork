import { describe, expect, it } from 'vitest';
import { frameOf } from './assets.ts';
import { compileMap, type CompiledMap } from './map.ts';
import { tableAtSide } from './tables.ts';
import { FURNITURE, buildTestMap, type TestMapOptions } from './testing.ts';

const PING_PONG = { tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'ping-pong'), x: 4, y: 4, w: 3, h: 2 } as const;

function compiled(options: TestMapOptions): CompiledMap {
  const result = compileMap(buildTestMap({ width: 12, height: 9, ...options }));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

describe('mesas interativas', () => {
  it('mesa de pingpong vira CompiledTable com a pegada', () => {
    const map = compiled({ furniture: [PING_PONG] });
    expect(map.tables).toHaveLength(1);
    expect(map.tables[0]).toMatchObject({ key: 'ping-pong@4,3', game: 'pong', x: 4, y: 3, width: 3, height: 2 });
  });

  it('lados são as colunas caminháveis à esquerda e à direita', () => {
    const map = compiled({ furniture: [PING_PONG] });
    expect(map.tables[0]?.sides).toEqual({ left: [[3, 3], [3, 4]], right: [[7, 3], [7, 4]] });
  });

  it('lado bloqueado por parede fica sem tiles', () => {
    const map = compiled({ furniture: [PING_PONG], walls: [[7, 3], [7, 4]] });
    expect(map.tables[0]?.sides.right).toEqual([]);
  });

  it('outro móvel não vira mesa', () => {
    expect(compiled({ furniture: [{ x: 4, y: 4, tile: FURNITURE.plant }] }).tables).toEqual([]);
  });

  it('tableAtSide acha a mesa e o lado', () => {
    const map = compiled({ furniture: [PING_PONG] });
    expect(tableAtSide(map, 3, 4)).toMatchObject({ table: { key: 'ping-pong@4,3' }, side: 'left' });
    expect(tableAtSide(map, 7, 3)).toMatchObject({ side: 'right' });
    expect(tableAtSide(map, 5, 5)).toBeNull();
  });
});
