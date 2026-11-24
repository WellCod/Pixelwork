import { Canvas, type Ramp } from '../lib/draw.ts';
import { stamp, type Pixels } from '../lib/pixels.ts';

const VELVET: Ramp = { outline: 'grape', dark: 'violet', base: 'purple', light: 'lavender' };
const IRON: Ramp = { outline: 'ink', dark: 'shadow', base: 'dusk', light: 'mauve' };

function tile(paint: (canvas: Canvas) => void, width = 16): Pixels {
  const canvas = new Canvas(width, 16);
  paint(canvas);
  return canvas.toPixels();
}

/** Lanterna com gomos, recorte iluminado e talo. */
function pumpkin(canvas: Canvas, x: number, y: number): void {
  canvas.hline(x + 2, y + 2, 8, 'maroon').rect(x + 1, y + 3, 10, 7, 'maroon')
    .rect(x, y + 4, 12, 5, 'maroon').hline(x + 2, y + 10, 8, 'maroon');
  canvas.rect(x + 1, y + 4, 10, 5, 'orange').hline(x + 2, y + 3, 8, 'amber')
    .hline(x + 2, y + 9, 8, 'clay').vline(x + 2, y + 5, 3, 'coral')
    .vline(x + 9, y + 4, 5, 'clay').px(x + 6, y + 1, 'pine').px(x + 7, y, 'sage');
  canvas.px(x + 3, y + 5, 'ink').px(x + 8, y + 5, 'ink')
    .px(x + 4, y + 6, 'lemon').px(x + 7, y + 6, 'lemon')
    .hline(x + 4, y + 8, 4, 'maroon').px(x + 6, y + 8, 'gold');
}

export const deskPumpkin = tile((canvas) => pumpkin(canvas, 2, 3));

export const potion = tile((canvas) => {
  canvas.rect(6, 4, 4, 3, 'deepteal').rect(4, 8, 8, 5, 'deepteal').hline(5, 13, 6, 'deepteal');
  canvas.hline(5, 7, 6, 'deepteal').hline(6, 3, 4, 'bark').hline(6, 4, 4, 'honey');
  canvas.rect(5, 9, 6, 3, 'green').hline(5, 9, 5, 'lime').px(5, 8, 'seafoam').px(6, 10, 'lemon');
  canvas.px(9, 11, 'leaf').px(10, 12, 'emerald').px(10, 2, 'mint').px(11, 1, 'seafoam');
});

export const spellbook = tile((canvas) => {
  canvas.box(2, 6, 12, 8, VELVET).outline('grape');
  canvas.hline(3, 12, 10, 'cream').hline(4, 7, 8, 'lavender').vline(4, 8, 4, 'violet');
  canvas.px(8, 8, 'gold').hline(7, 9, 2, 'honey').hline(8, 10, 2, 'gold').px(11, 8, 'lilac');
});

export const skull = tile((canvas) => {
  canvas.rect(4, 6, 8, 6, 'dusk').hline(5, 5, 6, 'dusk').rect(6, 12, 4, 2, 'dusk');
  canvas.rect(5, 7, 6, 4, 'mist').hline(5, 6, 5, 'white').hline(6, 11, 4, 'cream');
  canvas.px(6, 8, 'ink').px(9, 8, 'ink').px(8, 10, 'dusk').px(7, 12, 'white').px(9, 12, 'cream');
});

export const cobweb = tile((canvas) => {
  // Fios partem do prego no canto superior e se unem em três arcos de tamanhos diferentes.
  canvas.hline(3, 3, 11, 'violet').vline(3, 3, 11, 'violet');
  for (let offset = 1; offset < 9; offset++) canvas.px(3 + offset, 3 + offset, 'lavender');
  for (const size of [3, 6, 9]) {
    for (let offset = 0; offset < size; offset++) {
      const end = size - Math.floor(offset / 2);
      canvas.px(3 + offset, 3 + end, 'violet').px(3 + end, 3 + offset, 'violet');
    }
  }
  canvas.px(3, 3, 'cream').vline(11, 10, 4, 'dusk').px(10, 13, 'ink').px(12, 13, 'ink');
});

export const garland = tile((canvas) => {
  canvas.hline(1, 4, 4, 'grape').hline(5, 5, 6, 'grape').hline(11, 4, 4, 'grape');
  canvas.rect(2, 5, 3, 3, 'orange').px(3, 8, 'clay').px(3, 6, 'gold');
  canvas.rect(6, 6, 4, 3, 'violet').hline(7, 9, 2, 'grape').px(7, 7, 'lilac');
  canvas.rect(11, 5, 3, 3, 'orange').px(12, 8, 'clay').px(12, 6, 'gold');
});

export const blackCat = tile((canvas) => {
  canvas.rect(7, 9, 5, 5, 'ink').hline(7, 13, 5, 'dusk').vline(12, 10, 4, 'ink').hline(12, 10, 2, 'ink');
  canvas.rect(3, 7, 6, 5, 'ink').px(3, 6, 'ink').px(8, 6, 'ink').hline(4, 8, 4, 'shadow');
  canvas.px(4, 9, 'gold').px(7, 9, 'gold').px(5, 10, 'pink').hline(3, 12, 3, 'grape');
});

export const candyBucket = tile((canvas) => {
  canvas.hline(5, 5, 6, 'grape').vline(4, 6, 3, 'violet').vline(11, 6, 3, 'violet');
  canvas.box(3, 8, 10, 7, VELVET).outline('grape');
  canvas.hline(5, 8, 6, 'gold').px(6, 7, 'pink').px(8, 6, 'lime').px(10, 7, 'coral');
  canvas.rect(6, 10, 4, 3, 'mist').hline(7, 9, 2, 'white').px(7, 11, 'ink').px(9, 11, 'ink');
});

export const cauldron = tile((canvas) => {
  canvas.box(2, 7, 12, 7, IRON).outline('ink').hline(3, 7, 10, 'mauve')
    .hline(4, 8, 8, 'emerald').hline(6, 8, 4, 'lime').px(5, 7, 'sprout');
  canvas.px(4, 14, 'ink').px(11, 14, 'ink').px(6, 5, 'leaf').px(9, 4, 'mint').px(8, 2, 'seafoam');
});

function candle(canvas: Canvas, x: number, y: number): void {
  canvas.vline(x, y + 1, 4, 'cream').px(x - 1, y + 2, 'white').px(x, y, 'orange').px(x, y - 1, 'gold');
}

export const candelabra = tile((canvas) => {
  canvas.hline(4, 9, 9, 'shadow').vline(8, 8, 6, 'ink').vline(7, 9, 4, 'mauve');
  canvas.hline(5, 13, 7, 'dusk').hline(4, 14, 9, 'ink');
  candle(canvas, 4, 5);
  candle(canvas, 8, 3);
  candle(canvas, 12, 5);
});

export const tombstone = tile((canvas) => {
  canvas.rect(3, 5, 10, 9, 'shadow').hline(5, 4, 6, 'shadow').rect(4, 6, 8, 7, 'gray');
  canvas.hline(5, 5, 6, 'mist').vline(5, 7, 5, 'mist').vline(8, 7, 4, 'shadow').hline(7, 8, 3, 'shadow');
  canvas.hline(2, 13, 12, 'slate').hline(1, 14, 14, 'fern').px(4, 13, 'sage').px(12, 14, 'celery');
});

export const ghostMat = tile((canvas) => {
  canvas.box(1, 4, 14, 10, VELVET).outline('grape').hline(2, 5, 12, 'lavender');
  canvas.hline(6, 6, 4, 'white').rect(5, 7, 6, 4, 'mist').hline(5, 11, 6, 'white');
  canvas.px(5, 12, 'mist').px(8, 12, 'mist').px(10, 12, 'mist').px(6, 8, 'ink').px(9, 8, 'ink');
});

export const pumpkinPair = tile((canvas) => {
  pumpkin(canvas, 3, 4);
  pumpkin(canvas, 17, 3);
  canvas.px(15, 13, 'gold').px(26, 6, 'coral').px(30, 9, 'amber');
}, 32);

export const vampireSofa = tile((canvas) => {
  canvas.box(3, 2, 26, 10, VELVET).rect(3, 9, 26, 5, 'violet');
  for (const x of [6, 13, 20]) {
    canvas.rect(x, 5, 6, 4, 'purple').px(x + 2, 6, 'grape').px(x + 2, 7, 'lavender');
    canvas.box(x, 9, 6, 3, VELVET);
  }
  canvas.box(1, 7, 5, 7, IRON).box(26, 7, 5, 7, IRON).hline(6, 13, 20, 'grape');
  canvas.outline('grape').px(4, 14, 'ink').px(27, 14, 'ink').hline(11, 3, 10, 'lavender');
}, 32);

export const treatTable = tile((canvas) => {
  canvas.box(2, 4, 28, 9, IRON).vline(4, 12, 3, 'ink').vline(27, 12, 3, 'ink');
  canvas.rect(10, 5, 12, 8, 'violet').hline(11, 5, 10, 'lavender').hline(11, 12, 10, 'grape');
  canvas.outline('ink');
  canvas.rect(6, 7, 5, 3, 'honey').px(6, 7, 'peach').px(8, 8, 'red');
  canvas.rect(13, 6, 6, 4, 'maroon').hline(13, 6, 6, 'amber').px(15, 7, 'lime').px(17, 8, 'pink');
  canvas.rect(22, 7, 5, 3, 'mint').px(23, 7, 'white').px(25, 8, 'teal');
}, 32);

/** Peça de piso do mapa com a mesma cabeça de gato da decoração de mesa. */
export const familiarCushion = (() => {
  const cushion = tile((canvas) => canvas.box(1, 9, 14, 6, VELVET).outline('grape').hline(3, 13, 10, 'lavender'));
  stamp(cushion, blackCat, 0, -2);
  return cushion;
})();
