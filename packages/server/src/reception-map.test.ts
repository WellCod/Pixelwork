import { compileMap, findPath, frameOf, isWalkable, nextProximity, TILE_PX, type MapError } from '@pixelwork/shared';
import { CommandStack, linkedReceptionOf, moveObject, objectLayer, removeObject, type TilesetRef } from '@pixelwork/shared/editor';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { loadDemoTemplate, loadTemplate, withDemoReception } from './demo.ts';

const point = { point: true, x: 3.5 * TILE_PX, y: 3.5 * TILE_PX };
function documentWith(objects: unknown) {
  const map = buildTestMap({ zones: [{ key: 'sala', type: 'meeting', x: 6, y: 2, w: 2, h: 2 }] });
  return { ...map, layers: [...(map.layers as unknown[]), { name: 'reception', type: 'objectgroup', objects }] };
}

describe('marcador de recepção', () => {
  it('continua aceitando mapas antigos e uma camada sem ponto', () => {
    for (const map of [loadTemplate('small-office'), documentWith([])]) {
      const result = compileMap(map);
      expect(result.ok && result.map.reception === undefined).toBe(true);
    }
  });

  it('compila um ponto em coordenadas de tile e deixa a recepção da demo acessível', () => {
    const result = compileMap(documentWith([point]));
    expect(result.ok && result.map.reception).toEqual({ x: 3, y: 3 });
    const template = loadDemoTemplate();
    const demo = compileMap(template);
    if (!demo.ok || !demo.map.reception) throw new Error('recepção da demo inválida');
    expect(demo.map.reception).toEqual({ x: 35, y: 12, seated: true });
    expect(withDemoReception(template)).toEqual(template);
    expect(findPath(demo.map, demo.map.spawn, demo.map.reception)).not.toBeNull();
    const approach = { id: 'visitante', x: 33, y: 13 };
    expect(findPath(demo.map, demo.map.spawn, approach)).not.toBeNull();
    expect(nextProximity(demo.map, approach, [{ ...demo.map.reception, id: 'recepcao' }], new Set())).toEqual(new Set(['recepcao']));
    expect(isWalkable(demo.map, 34, 13)).toBe(false);
    expect(isWalkable(demo.map, 34, 12)).toBe(true);
  });

  it('move o balcão e a recepcionista sentada juntos, com desfazer e refazer', () => {
    const template = loadDemoTemplate();
    const ref = (template.tilesets as TilesetRef[]).find(({ source }) => source === 'furniture-3x2.tsj');
    if (!ref) throw new Error('tileset da cabine ausente');
    const counter = objectLayer(template, 'furniture').objects.find(({ gid }) => gid === ref.firstgid + frameOf('furniture-3x2', 'reception'));
    if (!counter) throw new Error('balcão da recepção ausente');
    const stack = new CommandStack(template);
    expect(linkedReceptionOf(template, counter)?.point).toBe(true);

    // A parede da Aurora e o fliperama ao lado não podem receber a cabine.
    expect(moveObject(stack.doc, 'furniture', counter.id, 34, 12)).toBeNull();
    expect(moveObject(stack.doc, 'furniture', counter.id, 35, 14)).toBeNull();
    const move = moveObject(stack.doc, 'furniture', counter.id, 33, 14);
    expect(move?.kind).toBe('batch');
    stack.execute(move);
    const moved = stack.doc;
    const compiled = compileMap(moved);
    expect(compiled.ok && compiled.map.reception).toEqual({ x: 34, y: 12, seated: true });
    expect(objectLayer(moved, 'furniture').objects.find(({ id }) => id === counter.id)?.x).toBe(33 * TILE_PX);
    stack.undo();
    expect(stack.doc).toEqual(template);
    stack.redo();
    expect(stack.doc).toEqual(moved);

    stack.execute(removeObject(stack.doc, 'furniture', counter.id));
    expect(objectLayer(stack.doc, 'reception').objects).toHaveLength(0);
    stack.undo();
    expect(stack.doc).toEqual(moved);
  });

  it.each<[unknown, MapError['code']]>([
    [[point, point], 'reception_count'],
    [[{ ...point, point: false }], 'reception_point'],
    [[{ ...point, x: '48' }], 'reception_point'],
    [[{ ...point, x: Infinity }], 'reception_point'],
    [[{ ...point, x: 0 }], 'reception_blocked'],
    [[{ ...point, x: 100 * TILE_PX }], 'reception_blocked'],
    [[{ ...point, x: 6.5 * TILE_PX }], 'reception_in_meeting'],
  ])('rejeita %j com %s', (objects, code) => {
    const result = compileMap(documentWith(objects));
    expect(result.ok || result.errors.some((entry) => entry.code === code)).toBe(true);
    expect(result.ok).toBe(false);
  });
});
