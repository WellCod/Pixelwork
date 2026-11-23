import { compileMap, type CompiledDesk, type CompiledMap, type DeskDecor, type DeskState } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { deskSprites, dividerLayout, isNear, seatedFacing } from './presence.ts';

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
    expect(layout?.pieces.map((piece) => piece.item)).toEqual(['divider-wide-l', 'divider-wide-r']);
    expect(layout?.pieces[1]?.dx).toBe(16);
    expect(layout?.back[1]).toBeLessThan(0);
  });

  it('mesa lateral virada para a direita usa o painel lateral espelhado, um por tile', () => {
    const layout = dividerLayout(desk('right', 1, 2));
    expect(layout?.pieces).toHaveLength(2);
    expect(layout?.pieces.every((piece) => piece.item === 'divider-side' && piece.flip)).toBe(true);
  });
});

describe('deskSprites', () => {
  const desk = (overrides: Partial<CompiledDesk>): CompiledDesk => ({
    key: 'm', x: 0, y: 0, w: 2, h: 1, orientation: 'down', chairX: 0, chairY: 1, wallBehind: true, ...overrides,
  });
  const decor: DeskDecor = { variant: 'white', monitor: 'dual', slots: { left: 'duck', right: 'pencil-cup', back: 'calendar', floor: 'cat' } };
  const at = (sprites: ReturnType<typeof deskSprites>, item: string) => sprites.find((sprite) => sprite.item === item);

  it('mesa larga virada para baixo: metades, monitor no meio e itens nas pontas', () => {
    const sprites = deskSprites(desk({}), decor);
    expect(at(sprites, 'white-wide-l')).toMatchObject({ dx: 0, dy: 0 });
    expect(at(sprites, 'white-wide-r')).toMatchObject({ dx: 16, dy: 0 });
    expect(at(sprites, 'monitor-dual')).toMatchObject({ dx: 8, dy: -2 });
    expect(at(sprites, 'duck')).toMatchObject({ dx: -3, dy: -3 });
    expect(at(sprites, 'calendar')).toMatchObject({ dx: 8, dy: -14 });
  });

  it('mesa lateral virada para a esquerda usa as metades de cima e de baixo e os deslocamentos dela', () => {
    const sprites = deskSprites(desk({ w: 1, h: 2, orientation: 'left' }), decor);
    expect(at(sprites, 'white-tall-t')).toMatchObject({ dx: 0, dy: -16 });
    expect(at(sprites, 'white-tall-b')).toMatchObject({ dx: 0, dy: 0 });
    expect(at(sprites, 'monitor-dual')).toMatchObject({ dx: 0, dy: -17 });
    expect(at(sprites, 'cat')).toMatchObject({ dx: 2, dy: 14 });
  });

  it('sem parede atrás o item de parede vai na divisória, que fica atrás dele', () => {
    const sprites = deskSprites(desk({ wallBehind: false }), decor);
    const panel = at(sprites, 'divider-wide-l');
    const calendar = at(sprites, 'calendar');
    expect(calendar).toMatchObject({ dx: 8, dy: -9 });
    expect(panel && calendar && panel.z < calendar.z).toBe(true);
  });

  it('mesa livre (sem decoração): variação padrão e um monitor, sem itens', () => {
    expect(deskSprites(desk({ w: 1 }), null).map((sprite) => sprite.item)).toEqual(['basic', 'monitor-single']);
  });
});
