// Desenho por grades de caracteres: um caractere por pixel, mapeado para a paleta (docs/art.md).
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './palette.ts';

/** Paleta Endesga 32 por letra, mais as rampas-chave da troca de paleta (1-4 pele, 5-8 cabelo, A C D F roupa). */
export const COLORS: Record<string, string> = {
  K: '#181425',
  k: '#262b44',
  n: '#3a4466',
  g: '#5a6988',
  G: '#8b9bb4',
  L: '#c0cbdc',
  W: '#ffffff',
  b: '#3e2731',
  B: '#733e39',
  w: '#b86f50',
  x: '#c28569',
  y: '#e4a672',
  Y: '#ead4aa',
  t: '#e8b796',
  r: '#a22633',
  R: '#e43b44',
  p: '#f6757a',
  o: '#f77622',
  O: '#feae34',
  Z: '#fee761',
  e: '#193c3e',
  f: '#265c42',
  v: '#3e8948',
  V: '#63c74d',
  u: '#124e89',
  U: '#0099db',
  c: '#2ce8f5',
  m: '#68386c',
  M: '#b55088',
  q: '#be4a2f',
  Q: '#d77643',
  '1': KEY_RAMPS.skin[0],
  '2': KEY_RAMPS.skin[1],
  '3': KEY_RAMPS.skin[2],
  '4': KEY_RAMPS.skin[3],
  '5': KEY_RAMPS.hair[0],
  '6': KEY_RAMPS.hair[1],
  '7': KEY_RAMPS.hair[2],
  '8': KEY_RAMPS.hair[3],
  A: KEY_RAMPS.outfit[0],
  C: KEY_RAMPS.outfit[1],
  D: KEY_RAMPS.outfit[2],
  F: KEY_RAMPS.outfit[3],
};

/** Matriz de caracteres; '.' é transparente. */
export type Pixels = string[][];

export function blank(width: number, height: number): Pixels {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => '.'));
}

/** Converte linhas de texto em matriz, conferindo a largura de cada linha. */
export function grid(rows: readonly string[], width: number, label: string): Pixels {
  return rows.map((row, i) => {
    if (row.length !== width) throw new Error(`${label}: linha ${i} tem ${row.length} colunas, esperado ${width}`);
    return Array.from({ length: width }, (_, x) => row.charAt(x));
  });
}

/** Copia `src` sobre `dst` na posição dada; '.' não apaga o que está embaixo. */
export function stamp(dst: Pixels, src: Pixels, x0: number, y0: number): void {
  src.forEach((row, y) =>
    row.forEach((ch, x) => {
      const ty = y0 + y;
      const tx = x0 + x;
      if (ch === '.' || ty < 0 || ty >= dst.length) return;
      const line = dst[ty];
      if (!line || tx < 0 || tx >= line.length) return;
      line[tx] = ch;
    }),
  );
}

export function mirror(src: Pixels): Pixels {
  return src.map((row) => [...row].reverse());
}

export function toPng(pixels: Pixels): PNG {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  const png = new PNG({ width, height });
  png.data.fill(0);
  pixels.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch === '.') return;
      const hex = COLORS[ch];
      if (!hex) throw new Error(`cor desconhecida "${ch}" em (${x},${y})`);
      const i = (y * width + x) * 4;
      png.data[i] = parseInt(hex.slice(1, 3), 16);
      png.data[i + 1] = parseInt(hex.slice(3, 5), 16);
      png.data[i + 2] = parseInt(hex.slice(5, 7), 16);
      png.data[i + 3] = 255;
    }),
  );
  return png;
}

/** Tile gerado por função (x, y) -> caractere, para texturas repetíveis como pisos. */
export function pattern(size: number, fn: (x: number, y: number) => string): Pixels {
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => fn(x, y)));
}
