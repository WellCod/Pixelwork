import { Canvas, type Ramp } from '../lib/draw.ts';
import type { Pixels } from '../lib/pixels.ts';

const RED: Ramp = { outline: 'wine', dark: 'crimson', base: 'red', light: 'salmon' };
const TEAL: Ramp = { outline: 'deepteal', dark: 'teal', base: 'aqua', light: 'mint' };
const PURPLE: Ramp = { outline: 'grape', dark: 'violet', base: 'purple', light: 'lavender' };

function gift(canvas: Canvas, x: number, y: number, width: number, height: number, ramp: Ramp): void {
  const ribbon = x + Math.floor(width / 2);
  canvas.box(x, y, width, height, ramp).hline(x, y + height - 1, width, ramp.outline);
  canvas.vline(ribbon, y, height - 1, 'gold').hline(x + 1, y + 2, width - 2, 'honey');
  canvas.px(ribbon - 1, y - 1, 'lemon').px(ribbon + 1, y - 1, 'gold');
}

/** Pinheiro fora do esquadro, com fitas em degraus e enfeites de cores alternadas. */
export function christmasRoomTree(): Pixels {
  const canvas = new Canvas(32, 32);
  canvas.rect(13, 24, 5, 6, 'bark').vline(14, 26, 3, 'clay');
  const tiers = [
    { center: 15, top: 15, rows: 12, spread: 13 },
    { center: 16, top: 10, rows: 12, spread: 10 },
    { center: 14, top: 5, rows: 12, spread: 7 },
  ];
  for (const { center, top, rows, spread } of tiers) {
    for (let row = 0; row < rows; row++) {
      const edge = 1 + Math.floor(row * spread / rows);
      const y = top + row;
      canvas.hline(center - edge, y, edge * 2 + 1, row >= rows - 2 ? 'pine' : 'green');
      if (row < rows - 2) canvas.hline(center - edge + 1, y, edge, row % 4 === 1 ? 'leaf' : 'emerald');
      if (row > 3 && row < rows - 1) canvas.px(center + edge - 1, y, 'pine');
    }
  }
  canvas.outline('pine', (_x, y) => y < 27);
  for (const [x, y, width] of [[9, 12, 3], [12, 14, 4], [16, 15, 4], [7, 20, 4], [11, 22, 7], [18, 23, 6]] as const) {
    canvas.hline(x, y, width, 'honey').px(x, y, 'lemon');
  }
  for (const [x, y, color, light] of [
    [12, 10, 'crimson', 'salmon'], [16, 13, 'violet', 'lilac'], [10, 18, 'crimson', 'salmon'],
    [19, 18, 'blue', 'ice'], [6, 24, 'crimson', 'salmon'], [15, 24, 'violet', 'lilac'], [23, 22, 'crimson', 'salmon'],
  ] as const) {
    canvas.rect(x, y, 2, 2, color).px(x, y, light);
  }
  canvas.vline(14, 1, 7, 'gold').hline(11, 4, 7, 'gold').rect(13, 3, 3, 3, 'lemon');
  canvas.px(13, 3, 'white').px(17, 6, 'amber').px(12, 6, 'honey');
  gift(canvas, 3, 26, 8, 5, RED);
  gift(canvas, 20, 26, 9, 5, PURPLE);
  return canvas.toPixels();
}

export function christmasRoomGifts(): Pixels {
  const canvas = new Canvas(16, 16);
  gift(canvas, 2, 8, 7, 7, RED);
  gift(canvas, 8, 7, 6, 8, TEAL);
  gift(canvas, 4, 5, 6, 5, PURPLE);
  return canvas.toPixels();
}

export function christmasRoomMax(): Pixels {
  const canvas = new Canvas(16, 16);
  canvas.rect(8, 8, 5, 6, 'bark').rect(9, 9, 3, 4, 'tan').px(13, 9, 'clay').px(14, 8, 'bark');
  canvas.hline(8, 14, 5, 'rust').px(9, 14, 'honey').px(12, 14, 'honey');
  canvas.rect(3, 6, 6, 6, 'bark').rect(4, 7, 5, 4, 'tan').vline(8, 7, 4, 'maroon');
  canvas.hline(2, 9, 4, 'honey').px(2, 9, 'ink').px(5, 8, 'ink');
  canvas.hline(5, 11, 4, 'crimson').px(7, 12, 'red').px(8, 12, 'gold');
  canvas.vline(6, 1, 5, 'bark').px(5, 2, 'tan').px(7, 1, 'honey').px(8, 3, 'bark');
  canvas.px(5, 6, 'salmon').hline(6, 6, 3, 'red');
  return canvas.toPixels();
}
