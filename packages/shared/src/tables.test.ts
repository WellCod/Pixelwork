import { describe, expect, it } from 'vitest';
import { frameOf } from './assets.ts';
import { compileMap, isWalkable, type CompiledMap } from './map.ts';
import { gameTableLayout, gameTableSides, tableAtSide } from './tables.ts';
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

  it('pingpong vertical bloqueia 2x3 e admite jogadores só acima e abaixo', () => {
    const tileset = 'furniture-2x3';
    const map = compiled({ furniture: [{ ...PING_PONG, tileset, tile: frameOf(tileset, 'ping-pong-vertical'), y: 5, w: 2, h: 3 }], walls: [[5, 2]] });
    expect(map.tables[0]).toMatchObject({ key: 'ping-pong@4,3', width: 2, height: 3, sides: { left: [[4, 2]], right: [[4, 6], [5, 6]] } });
    for (const y of [3, 4, 5]) for (const x of [4, 5]) expect(isWalkable(map, x, y)).toBe(false);
    expect(isWalkable(map, 6, 4)).toBe(true);
    expect(tableAtSide(map, 4, 2)).toMatchObject({ side: 'left' });
    expect(tableAtSide(map, 5, 6)).toMatchObject({ side: 'right' });
    expect(tableAtSide(map, 3, 4)).toBeNull();
  });

  it('o pebolim vertical mantém a colisão e marca posições ao lado das hastes', () => {
    const tileset = 'furniture-2x3';
    const map = compiled({ furniture: [{ ...PING_PONG, tileset, tile: frameOf(tileset, 'foosball-vertical'), y: 5, w: 2, h: 3 }], walls: [[6, 4]] });
    const layout = gameTableLayout('foosball-vertical');
    expect(gameTableLayout('foosball')?.sideAxis).toBe('y');
    if (!layout) throw new Error('layout ausente');
    expect(gameTableSides({ x: 4, y: 3, width: 2, height: 3 }, layout.sideAxis, map.width, map.height, (x, y) => isWalkable(map, x, y)))
      .toEqual({ left: [[3, 3], [3, 4], [3, 5]], right: [[6, 3], [6, 5]] });
    for (const y of [3, 4, 5]) for (const x of [4, 5]) expect(isWalkable(map, x, y)).toBe(false);
    expect(map.tables[0]).toMatchObject({ key: 'foosball@4,3', game: 'foosball', sides: { left: [[3, 3], [3, 4], [3, 5]], right: [[6, 3], [6, 5]] } });
  });

  it('no pebolim horizontal os jogadores ficam acima e abaixo das hastes', () => {
    const map = compiled({ furniture: [{ ...PING_PONG, tile: frameOf('furniture-3x2', 'foosball') }] });
    expect(tableAtSide(map, 4, 2)).toMatchObject({ table: { key: 'foosball@4,3', game: 'foosball' }, side: 'left' });
    expect(tableAtSide(map, 6, 5)).toMatchObject({ side: 'right' });
    expect(tableAtSide(map, 3, 3)).toBeNull();
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
