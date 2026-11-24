import { compileMap, frameOf, isWalkable } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { categorize } from './categories.ts';
import { FURNITURE_OPTIONS } from './editor-controller.ts';

describe('categorias de móveis do editor', () => {
  it('todo móvel colocável aparece numa categoria só', () => {
    const groups = categorize(FURNITURE_OPTIONS);
    const seen = groups.flatMap((group) => group.items.map((option) => `${option.tileset}:${option.frame}`));
    expect(seen.sort()).toEqual(FURNITURE_OPTIONS.map((option) => `${option.tileset}:${option.frame}`).sort());
  });

  it('oferece móveis de Halloween e mantém o capacho caminhável', () => {
    const group = categorize(FURNITURE_OPTIONS).find(({ label }) => label === 'Halloween');
    expect(group?.items.map(({ item }) => item)).toContain('halloween-vampire-sofa');
    const result = compileMap(buildTestMap({ furniture: [
      { x: 3, y: 3, tileset: 'furniture-2x1-halloween', tile: frameOf('furniture-2x1-halloween', 'halloween-vampire-sofa'), w: 2 },
      { x: 5, y: 3, tileset: 'furniture-halloween', tile: frameOf('furniture-halloween', 'halloween-ghost-mat') },
    ] }));
    if (!result.ok) throw new Error('mapa de teste inválido');
    expect([3, 4, 5].map((x) => isWalkable(result.map, x, 3))).toEqual([false, false, true]);
  });

  it('móvel sem categoria cai em Outros, e categoria vazia não aparece', () => {
    const groups = categorize([{ tileset: 'furniture', frame: 99, item: 'objeto-misterioso' }]);
    expect(groups.map((group) => group.label)).toEqual(['Outros']);
  });

  it('as categorias principais existem com os móveis do catálogo', () => {
    const labels = categorize(FURNITURE_OPTIONS).map((group) => group.label);
    for (const label of ['Escritório', 'Sala', 'Copa', 'Plantas', 'Decoração', 'Lazer']) expect(labels).toContain(label);
    expect(labels).not.toContain('Outros');
  });
});
