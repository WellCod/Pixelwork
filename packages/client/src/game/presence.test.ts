import { compileMap, type CompiledMap, type DeskState } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { isNear, seatedFacing, dividerLayout } from './presence.ts';

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

describe('dividerLayout', () => {
  const desk = (orientation: 'down' | 'up' | 'left' | 'right', w: number, h: number, wallBehind = false) =>
    ({ key: 'm', x: 0, y: 0, w, h, orientation, chairX: 0, chairY: 0, wallBehind });

  it('com parede atrás não há divisória', () => {
    expect(dividerLayout(desk('down', 2, 1, true))).toBeNull();
  });

  it('mesa larga virada para baixo: duas metades atrás e o item preso no painel', () => {
    const layout = dividerLayout(desk('down', 2, 1));
    expect(layout?.pieces.map((p) => p.item)).toEqual(['divider-wide-l', 'divider-wide-r']);
    expect(layout?.pieces[1]?.dx).toBe(16);
    expect(layout?.back[1]).toBeLessThan(0);
  });

  it('mesa lateral virada para a direita usa o painel lateral espelhado, um por tile', () => {
    const layout = dividerLayout(desk('right', 1, 2));
    expect(layout?.pieces).toHaveLength(2);
    expect(layout?.pieces.every((p) => p.item === 'divider-side' && p.flip)).toBe(true);
  });
});
