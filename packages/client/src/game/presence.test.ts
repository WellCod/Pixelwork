import { compileMap, type CompiledDesk, type CompiledMap, type DeskDecor, type DeskState } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { deskDecorFrame, deskSprites, dividerLayout, isNear, seatedPose } from './presence.ts';

function testMap(): CompiledMap {
  const result = compileMap(buildTestMap({ desks: [{ key: 'mesa', x: 3, y: 1, orientation: 'down' }] }));
  if (!result.ok) throw new Error('fixture inválida');
  return result.map;
}

const map = testMap();
const owned = (userId: string | null) =>
  new Map<string, DeskState>([['mesa', { deskKey: 'mesa', userId, ownerName: null, decor: null }]]);

describe('seatedPose', () => {
  it('dono na cadeira olha para a mesa', () => {
    expect(seatedPose(map, owned('a'), 'a', 3, 2)).toEqual({ facing: 'up', dx: 0, dy: 0 });
  });

  it.each([
    { orientation: 'down', chairX: 3, chairY: 4, facing: 'up', dx: 8, dy: 0 },
    { orientation: 'up', chairX: 3, chairY: 2, facing: 'down', dx: 8, dy: 0 },
    { orientation: 'left', chairX: 2, chairY: 3, facing: 'right', dx: 0, dy: 8 },
    { orientation: 'right', chairX: 4, chairY: 3, facing: 'left', dx: 0, dy: 8 },
  ] as const)('centraliza o assento da mesa virada para $orientation', ({ orientation, chairX, chairY, facing, dx, dy }) => {
    const result = compileMap(buildTestMap({ desks: [{ key: 'mesa', x: 3, y: 3, orientation, size: 2 }] }));
    if (!result.ok) throw new Error('fixture inválida');
    expect(seatedPose(result.map, owned('a'), 'a', chairX, chairY)).toEqual({ facing, dx, dy });
  });

  it('outra pessoa na cadeira, mesa livre ou fora da cadeira não está sentada', () => {
    expect(seatedPose(map, owned('a'), 'b', 3, 2)).toBeNull();
    expect(seatedPose(map, owned(null), 'a', 3, 2)).toBeNull();
    expect(seatedPose(map, owned('a'), 'a', 4, 2)).toBeNull();
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
  const desk = (orientation: 'down' | 'up' | 'left' | 'right', width: number, height: number, wallBehind = false) =>
    ({ key: 'm', x: 0, y: 0, width, height, orientation, chairX: 0, chairY: 0, wallBehind });

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
    key: 'm', x: 0, y: 0, width: 2, height: 1, orientation: 'down', chairX: 0, chairY: 1, wallBehind: true, ...overrides,
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
    const sprites = deskSprites(desk({ width: 1, height: 2, orientation: 'left' }), decor);
    expect(at(sprites, 'white-tall-t')).toMatchObject({ dx: 0, dy: -16 });
    expect(at(sprites, 'white-tall-b')).toMatchObject({ dx: 0, dy: 0 });
    expect(at(sprites, 'monitor-dual-side')).toMatchObject({ dx: 2, dy: -17, flip: false });
    expect(at(sprites, 'cat')).toMatchObject({ dx: 2, dy: 14 });
  });

  it('renderiza o tampo Crepúsculo e os enfeites de Halloween em todas as orientações', () => {
    const halloween: DeskDecor = {
      variant: 'halloween-twilight', monitor: 'single',
      slots: { left: 'halloween-pumpkin-lamp', right: 'halloween-potion', back: 'halloween-cobweb', floor: 'halloween-black-cat' },
    };
    const desks = [
      desk({ width: 1 }), desk({}), desk({ orientation: 'up' }),
      desk({ width: 1, height: 2, orientation: 'left' }), desk({ width: 1, height: 2, orientation: 'right' }),
    ];
    for (const candidate of desks) {
      const pieces = deskSprites(candidate, halloween).filter(({ item }) => item.startsWith('halloween-'));
      expect(pieces).toHaveLength(candidate.width * candidate.height + 4);
      for (const { item } of pieces) expect(deskDecorFrame(item)?.tileset).toBe('desk-decor-halloween');
    }
  });

  it('na fileira oposta inverte os tampos, troca o lado do gaveteiro e desenha as costas do monitor', () => {
    const sprites = deskSprites(desk({ orientation: 'up' }), decor);
    expect(at(sprites, 'white-wide-l')).toMatchObject({ dx: 16, flip: true, flipY: true });
    expect(at(sprites, 'white-wide-r')).toMatchObject({ dx: 0, flip: true, flipY: true });
    expect(at(sprites, 'monitor-dual-back')).toMatchObject({ dx: 8, dy: -1 });
  });

  it('usa perfil espelhado à direita e todas as vistas existem no catálogo', () => {
    const sprites = deskSprites(desk({ width: 1, height: 2, orientation: 'right' }), decor);
    expect(at(sprites, 'monitor-dual-side')).toMatchObject({ dx: -2, flip: true, flipY: false });
    for (const monitor of ['single', 'dual', 'laptop'] as const) {
      for (const orientation of ['down', 'up', 'left', 'right'] as const) {
        const parts = deskSprites(desk({ orientation }), { ...decor, monitor });
        const sprite = parts.find((candidate) => candidate.item.startsWith('monitor-'));
        expect(sprite && deskDecorFrame(sprite.item)).toBeDefined();
      }
    }
  });

  it('sem parede atrás o item de parede vai na divisória, que fica atrás dele', () => {
    const sprites = deskSprites(desk({ wallBehind: false }), decor);
    const panel = at(sprites, 'divider-wide-l');
    const calendar = at(sprites, 'calendar');
    expect(calendar).toMatchObject({ dx: 8, dy: -9 });
    expect(panel && calendar && panel.z < calendar.z).toBe(true);
  });

  it('mesa livre (sem decoração): variação padrão e um monitor, sem itens', () => {
    expect(deskSprites(desk({ width: 1 }), null).map((sprite) => sprite.item)).toEqual(['basic', 'monitor-single']);
  });
});
