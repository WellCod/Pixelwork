import { compileMap, type CompiledMap, type DeskState } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { isNear, seatedFacing } from './presence.ts';

function testMap(): CompiledMap {
  const result = compileMap(buildTestMap({ desks: [{ key: 'mesa', x: 3, y: 1, orientation: 'down' }] }));
  if (!result.ok) throw new Error('fixture inválida');
  return result.map;
}

const map = testMap();
const owned = (userId: string | null) =>
  new Map<string, DeskState>([['mesa', { deskKey: 'mesa', userId, ownerName: null, decor: null }]]);

describe('seatedFacing', () => {
  it('dono na cadeira olha para a mesa', () => {
    expect(seatedFacing(map, owned('a'), 'a', 3, 2)).toBe('up');
  });

  it('outra pessoa na cadeira, mesa livre ou fora da cadeira não está sentada', () => {
    expect(seatedFacing(map, owned('a'), 'b', 3, 2)).toBeNull();
    expect(seatedFacing(map, owned(null), 'a', 3, 2)).toBeNull();
    expect(seatedFacing(map, owned('a'), 'a', 4, 2)).toBeNull();
  });
});

describe('isNear', () => {
  it('usa distância euclidiana até o raio de entrada', () => {
    expect(isNear(0, 0, 3, 0)).toBe(true);
    expect(isNear(0, 0, 2, 2)).toBe(true);
    expect(isNear(0, 0, 3, 1)).toBe(false);
  });
});
