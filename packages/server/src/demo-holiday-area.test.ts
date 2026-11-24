import { compileMap, findPath, frameOf, isWalkable } from '@pixelwork/shared';
import { apply, objectLayer, placeFurniture, type TiledDoc, type TilesetRef } from '@pixelwork/shared/editor';
import { describe, expect, it } from 'vitest';
import { loadDemoTemplate, loadTemplate } from './demo.ts';
import { withDemoHolidayArea } from './demo-holiday-area.ts';

describe('área Natal do Grinch', () => {
  it('entra no mapa do reset com árvore, Max e presentes e mantém as cadeiras acessíveis', () => {
    const template = loadDemoTemplate();
    const result = compileMap(template);
    if (!result.ok) throw new Error('mapa da demo inválido');
    const { map } = result;
    expect(map.zones.find(({ key }) => key === 'produto')?.name).toBe('Natal do Grinch');
    expect([isWalkable(map, 10, 2), isWalkable(map, 11, 3), isWalkable(map, 10, 5)]).toEqual([false, false, true]);
    expect(withDemoHolidayArea(template)).toEqual(template);

    const desks = map.desks.filter(({ key }) => /^mesa-[1-6]$/.test(key));
    expect(desks).toHaveLength(6);
    for (const desk of desks) expect(findPath(map, map.spawn, { x: desk.chairX, y: desk.chairY })).not.toBeNull();
    expect(map.desks.find(({ key }) => key === 'mesa-2')?.defaultDecor?.slots.right).toBe('grinch-max');

    const placements = objectLayer(template, 'furniture').objects;
    const references = template.tilesets as TilesetRef[];
    for (const [tileset, item, x, y] of [
      ['furniture-2x2-christmas', 'christmas-room-tree', 10, 3],
      ['furniture-christmas', 'christmas-room-max', 10, 5],
      ['furniture-christmas', 'christmas-room-gifts', 11, 6],
    ] as const) {
      const ref = references.find(({ source }) => source === `${tileset}.tsj`);
      if (!ref) throw new Error('tileset de Natal ausente');
      expect(placements).toContainEqual(expect.objectContaining({ gid: ref.firstgid + frameOf(tileset, item), x: x * 16, y: (y + 1) * 16 }));
    }
  });

  it('preserva o móvel que já ocupa o local da árvore', () => {
    const base = loadTemplate('small-office') as TiledDoc;
    const command = placeFurniture(base, 'furniture', frameOf('furniture', 'chair'), 10, 3);
    if (!command) throw new Error('posição da cadeira de teste inválida');
    const occupied = apply(base, command).doc;
    const decorated = withDemoHolidayArea(occupied);
    const existing = objectLayer(occupied, 'furniture').objects.at(-1);
    expect(objectLayer(decorated, 'furniture').objects).toContainEqual(existing);
    expect(decorated.tilesets).not.toContainEqual(expect.objectContaining({ source: 'furniture-2x2-christmas.tsj' }));
  });
});
