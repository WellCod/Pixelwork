import { describe, expect, it } from 'vitest';
import { categorize } from './categories.ts';
import { FURNITURE_OPTIONS } from './editor-controller.ts';

describe('categorias de móveis do editor', () => {
  it('todo móvel colocável aparece numa categoria só', () => {
    const groups = categorize(FURNITURE_OPTIONS);
    const seen = groups.flatMap((g) => g.items.map((o) => `${o.tileset}:${o.frame}`));
    expect(seen.sort()).toEqual(FURNITURE_OPTIONS.map((o) => `${o.tileset}:${o.frame}`).sort());
  });

  it('móvel sem categoria cai em Outros, e categoria vazia não aparece', () => {
    const groups = categorize([{ tileset: 'furniture', frame: 99, item: 'objeto-misterioso' }]);
    expect(groups.map((g) => g.label)).toEqual(['Outros']);
  });

  it('as categorias principais existem com os móveis do catálogo', () => {
    const labels = categorize(FURNITURE_OPTIONS).map((g) => g.label);
    for (const label of ['Escritório', 'Sala', 'Copa', 'Plantas', 'Decoração', 'Lazer']) expect(labels).toContain(label);
    expect(labels).not.toContain('Outros');
  });
});
