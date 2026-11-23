// Desenho por grades de caracteres: um caractere por pixel, mapeado para a paleta (docs/art.md).
import { PNG } from 'pngjs';
import { PALETTE, nearest, type ColorName } from './colors.ts';
import { KEY_RAMPS } from './palette.ts';

/**
 * Legado das grades antigas: letra -> cor Endesga 32, levada para a cor Resurrect 64 mais próxima
 * (`nearest`) até cada peça ser redesenhada com `sprite`. Rampas-chave: 1-4 pele, 5-8 cabelo, A C D F roupa.
 */
const ENDESGA: Record<string, string> = {
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

/**
 * Letra do legado -> hex final. Cores-chave passam intactas (a troca de paleta depende do valor
 * exato); as demais vão para a Resurrect 64 mais próxima.
 */
const KEY_HEX = new Set<string>(Object.values(KEY_RAMPS).flat());
export const COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(ENDESGA).map(([pixelChar, hex]) => [pixelChar, KEY_HEX.has(hex) ? hex : nearest(hex)]),
);

/** Nomes das cores-chave da troca de paleta, para as legendas dos sprites de personagem. */
export type KeyName = `${'skin' | 'hair' | 'outfit'}${1 | 2 | 3 | 4}`;

/** `skin3` -> terceiro tom da rampa de pele: o prefixo é a rampa, o dígito final é o tom (1 a 4). */
function keyHex(name: KeyName): string {
  const rampName = name.slice(0, -1) as keyof typeof KEY_RAMPS;
  const toneIndex = Number(name.slice(-1)) - 1;
  const hex = KEY_RAMPS[rampName][toneIndex];
  if (!hex) throw new Error(`cor-chave inválida: ${name}`);
  return hex;
}

/**
 * Sprite desenhado em grade com legenda própria: cada caractere vira a cor nomeada da legenda
 * (ou uma cor-chave), '.' é transparente. A matriz guarda o hex de cada pixel.
 */
export function sprite(rows: readonly string[], legend: Record<string, ColorName | KeyName>, label: string): Pixels {
  const width = rows[0]?.length ?? 0;
  return rows.map((row, y) => {
    if (row.length !== width) throw new Error(`${label}: linha ${y} tem ${row.length} colunas, esperado ${width}`);
    return Array.from(row, (pixelChar, x) => {
      if (pixelChar === '.') return '.';
      const colorName = legend[pixelChar];
      if (!colorName) throw new Error(`${label}: caractere "${pixelChar}" sem cor na legenda em (${x},${y})`);
      return colorName in PALETTE ? PALETTE[colorName as ColorName] : keyHex(colorName as KeyName);
    });
  });
}

/** Matriz de pixels: '.' transparente, hex (`sprite`) ou letra do legado (`grid`). */
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

/** Copia `source` sobre `target` na posição dada; '.' não apaga o que está embaixo e o que sai da borda é cortado. */
export function stamp(target: Pixels, source: Pixels, x0: number, y0: number): void {
  source.forEach((sourceRow, y) =>
    sourceRow.forEach((pixel, x) => {
      const targetY = y0 + y;
      const targetX = x0 + x;
      if (pixel === '.' || targetY < 0 || targetY >= target.length) return;
      const targetRow = target[targetY];
      if (!targetRow || targetX < 0 || targetX >= targetRow.length) return;
      targetRow[targetX] = pixel;
    }),
  );
}

/** Espelha na horizontal (vira o sprite para o outro lado). */
export function mirror(source: Pixels): Pixels {
  return source.map((row) => [...row].reverse());
}

/** Rasteriza a matriz num PNG RGBA; '.' fica com alfa 0 e o resto, opaco. */
export function toPng(pixels: Pixels): PNG {
  const height = pixels.length;
  const width = pixels[0]?.length ?? 0;
  const png = new PNG({ width, height });
  png.data.fill(0);
  pixels.forEach((row, y) =>
    row.forEach((pixel, x) => {
      if (pixel === '.') return;
      // Pixel de `sprite` já é hex; pixel de `grid` (legado) é uma letra de COLORS.
      const hex = pixel.startsWith('#') ? pixel : COLORS[pixel];
      if (!hex) throw new Error(`cor desconhecida "${pixel}" em (${x},${y})`);
      const offset = (y * width + x) * 4;
      png.data[offset] = parseInt(hex.slice(1, 3), 16);
      png.data[offset + 1] = parseInt(hex.slice(3, 5), 16);
      png.data[offset + 2] = parseInt(hex.slice(5, 7), 16);
      png.data[offset + 3] = 255;
    }),
  );
  return png;
}

/** Tile gerado por função (x, y) -> caractere, para texturas repetíveis como pisos. */
export function pattern(size: number, pixelAt: (x: number, y: number) => string): Pixels {
  return Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => pixelAt(x, y)));
}
