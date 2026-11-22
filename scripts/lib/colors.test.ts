import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTE, nearest } from './colors.ts';
import { parsePalette } from './palette.ts';
import { sprite, toPng } from './pixels.ts';

const root = join(import.meta.dirname, '../..');
const paletteFile = parsePalette(readFileSync(join(root, 'assets/palette.hex'), 'utf8'));

describe('PALETTE (Resurrect 64)', () => {
  it('tem 64 nomes com valores únicos, iguais ao assets/palette.hex', () => {
    const values = Object.values(PALETTE);
    expect(values).toHaveLength(64);
    expect(new Set(values).size).toBe(64);
    expect(new Set(values)).toEqual(new Set(paletteFile));
  });

  it('as rampas de pele, cabelo e roupa só usam cores da paleta, 4 por rampa', () => {
    const allowed = new Set(paletteFile);
    for (const kind of ['skin', 'hair', 'outfit']) {
      const ramps = JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;
      for (const [id, ramp] of Object.entries(ramps)) {
        expect({ kind, id, size: ramp.length }).toEqual({ kind, id, size: 4 });
        for (const color of ramp) expect({ kind, id, color, ok: allowed.has(color) }).toEqual({ kind, id, color, ok: true });
      }
    }
  });

  it('nearest devolve a própria cor quando ela está na paleta e a mais próxima quando não', () => {
    expect(nearest('#fdcbb0')).toBe('#fdcbb0');
    expect(nearest('#000000')).toBe(PALETTE.ink);
  });
});

describe('sprite', () => {
  it('troca cada caractere pela cor da legenda; ponto é transparente', () => {
    const pixels = sprite(['ab', 'b.'], { a: 'cream', b: 'ink' }, 'teste');
    expect(pixels).toEqual([
      [PALETTE.cream, PALETTE.ink],
      [PALETTE.ink, '.'],
    ]);
    const png = toPng(pixels);
    expect([...png.data.subarray(0, 4)]).toEqual([0xfd, 0xcb, 0xb0, 255]);
    expect(png.data[15]).toBe(0);
  });

  it('aceita as cores-chave da troca de paleta pelo nome', () => {
    const [[skin]] = sprite(['s'], { s: 'skin1' }, 'chave') as [[string]];
    expect(skin).toBe('#ff0001');
  });

  it('recusa caractere fora da legenda e linha com largura diferente', () => {
    expect(() => sprite(['ax'], { a: 'cream' }, 'teste')).toThrow('"x"');
    expect(() => sprite(['aa', 'a'], { a: 'cream' }, 'teste')).toThrow('linha 1');
  });
});
