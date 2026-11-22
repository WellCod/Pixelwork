import { describe, expect, it } from 'vitest';
import { DIR_DELTA } from './protocol.ts';
import { compileMap, isWalkable, type CompiledMap } from './map.ts';
import { findPath } from './pathfinding.ts';
import { buildTestMap } from './testing.ts';

function mapWith(walls: [number, number][] = []): CompiledMap {
  const result = compileMap(buildTestMap({ width: 12, height: 10, walls, spawns: [[1, 1]] }));
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.map;
}

/** Aplica o caminho conferindo que cada passo cai em tile caminhável. */
function walk(map: CompiledMap, from: { x: number; y: number }, path: readonly (keyof typeof DIR_DELTA)[]) {
  let { x, y } = from;
  for (const dir of path) {
    const [dx, dy] = DIR_DELTA[dir];
    x += dx;
    y += dy;
    expect(isWalkable(map, x, y)).toBe(true);
  }
  return { x, y };
}

describe('findPath', () => {
  it('caminho reto tem o tamanho da distância de Manhattan', () => {
    const map = mapWith();
    const path = findPath(map, { x: 1, y: 1 }, { x: 5, y: 4 });
    expect(path).toHaveLength(7);
    expect(walk(map, { x: 1, y: 1 }, path ?? [])).toEqual({ x: 5, y: 4 });
  });

  it('contorna parede', () => {
    // Parede vertical em x=5 de y=1 a y=7, com passagem em y=8.
    const walls: [number, number][] = [];
    for (let y = 1; y <= 7; y++) walls.push([5, y]);
    const map = mapWith(walls);
    const path = findPath(map, { x: 2, y: 2 }, { x: 8, y: 2 });
    expect(path).not.toBeNull();
    expect(walk(map, { x: 2, y: 2 }, path ?? [])).toEqual({ x: 8, y: 2 });
    expect(path?.length).toBe(6 + 2 * 6);
  });

  it('sem caminho devolve null; alvo na parede também', () => {
    const walls: [number, number][] = [];
    for (let y = 1; y <= 8; y++) walls.push([5, y]);
    const map = mapWith(walls);
    expect(findPath(map, { x: 2, y: 2 }, { x: 8, y: 2 })).toBeNull();
    expect(findPath(map, { x: 2, y: 2 }, { x: 0, y: 0 })).toBeNull();
  });

  it('stopAt para ao lado do alvo, e lista vazia quando já está perto', () => {
    const map = mapWith();
    const path = findPath(map, { x: 1, y: 1 }, { x: 4, y: 1 }, { stopAt: 1 });
    expect(path).toEqual(['right', 'right']);
    expect(findPath(map, { x: 3, y: 1 }, { x: 4, y: 1 }, { stopAt: 1 })).toEqual([]);
  });

  it('respeita a regra de entrada (sala trancada)', () => {
    const map = mapWith();
    const blocked = (_from: unknown, x: number, y: number) => !(x === 3 && y <= 2);
    const path = findPath(map, { x: 1, y: 1 }, { x: 5, y: 1 }, { canEnter: blocked });
    expect(path).not.toBeNull();
    let { x, y } = { x: 1, y: 1 };
    for (const dir of path ?? []) {
      x += DIR_DELTA[dir][0];
      y += DIR_DELTA[dir][1];
      expect(x === 3 && y <= 2).toBe(false);
    }
  });

  it('mapa 100x100 vazio resolve rápido', () => {
    const result = compileMap(buildTestMap({ width: 100, height: 100, spawns: [[1, 1]] }));
    if (!result.ok) throw new Error('fixture');
    const started = Date.now();
    expect(findPath(result.map, { x: 1, y: 1 }, { x: 98, y: 98 })).toHaveLength(194);
    expect(Date.now() - started).toBeLessThan(200);
  });
});
