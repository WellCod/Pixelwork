import { describe, expect, it } from 'vitest';
import { CatalogError, buildCatalog, type CatalogInput } from './lib/catalog.ts';

const own = (id: string) => ({ id, license: 'own', author: 'Pixelwork', source: null });

function input(overrides: Partial<CatalogInput> = {}): CatalogInput {
  return {
    manifest: {
      tilesets: [own('floors')],
      characters: { body: [own('base')], hair: [], outfit: [own('basic')], accessory: [] },
      deskDecor: { variants: [], decorItems: [], wallItems: [], floorItems: [] },
    },
    ramps: {
      skin: { light: ['#111111', '#222222', '#333333', '#444444'] },
      hair: { brown: ['#111111', '#222222', '#333333', '#444444'] },
      outfit: { blue: ['#111111', '#222222', '#333333', '#444444'] },
    },
    palette: new Set(['#111111', '#222222', '#333333', '#444444']),
    fileExists: () => true,
    readTileset: () => ({ tilewidth: 16, tileheight: 16, columns: 8, tilecount: 8, tiles: [{ id: 2, properties: [{ name: 'collides', type: 'bool', value: true }] }] }),
    ...overrides,
  };
}

function problems(catalogInput: CatalogInput): string[] {
  try {
    buildCatalog(catalogInput);
  } catch (error) {
    if (error instanceof CatalogError) return error.problems;
    throw error;
  }
  return [];
}

describe('buildCatalog', () => {
  it('gera os enums e os créditos a partir do manifesto', () => {
    const code = buildCatalog(input());
    expect(code).toContain("export const TILESET_IDS = ['floors'] as const;");
    expect(code).toContain("export const SKIN_PALETTES = ['light'] as const;");
    expect(code).toContain('"kind": "tileset"');
  });

  it('falha quando um asset do manifesto não tem licença', () => {
    const semLicenca = { id: 'floors', author: 'Pixelwork', source: null };
    const found = problems(
      input({
        manifest: {
          tilesets: [semLicenca],
          characters: { body: [own('base')], hair: [], outfit: [own('basic')], accessory: [] },
          deskDecor: { variants: [], decorItems: [], wallItems: [], floorItems: [] },
        },
      }),
    );
    expect(found).toEqual([expect.stringMatching(/^manifest\.tilesets\.0\.license:/)]);
  });

  it('recusa licença que não pode entrar no repositório', () => {
    const found = problems(
      input({
        manifest: {
          tilesets: [{ ...own('floors'), license: 'CC-BY-SA' }],
          characters: { body: [own('base')], hair: [], outfit: [own('basic')], accessory: [] },
          deskDecor: { variants: [], decorItems: [], wallItems: [], floorItems: [] },
        },
      }),
    );
    expect(found).toEqual([expect.stringMatching(/^manifest\.tilesets\.0\.license:/)]);
  });

  it('falha com arquivo ausente e rampa fora da paleta', () => {
    const found = problems(
      input({
        fileExists: (path) => path !== 'tilesets/floors.tsj',
        palette: new Set(['#111111', '#222222', '#333333']),
      }),
    );
    expect(found).toContain('tilesets: arquivo ausente tilesets/floors.tsj');
    expect(found).toContain('palettes/skin.json: light[3] #444444 fora da paleta');
  });
});
