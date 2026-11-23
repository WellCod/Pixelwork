// Móveis de várias células, um objeto só no mapa (docs/art.md). Cada lista é um tileset com a
// célula do tamanho indicado; só acrescentar no fim. Luz de cima à esquerda, frente aparecendo.
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import type { ColorName } from '../lib/colors.ts';
import type { TileArt } from './tiles.ts';

const BLUE: Ramp = { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' };
const WATER: Ramp = { outline: 'deepteal', dark: 'teal', base: 'aqua', light: 'seafoam' };
const TABLE_GREEN: Ramp = { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf' };
const RED: Ramp = { outline: 'maroon', dark: 'crimson', base: 'red', light: 'salmon' };

/** Máscara de círculo, testada no centro do pixel (+0,5). */
const circle = (centerX: number, centerY: number, radius: number) => (x: number, y: number) =>
  Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) <= radius;
/** União de máscaras: o pixel entra se estiver em qualquer uma. */
const any =
  (...masks: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number) =>
    masks.some((mask) => mask(x, y));

/**
 * Sofá visto de frente, com `sofaWidth` px a partir de (x0, y0): encosto, braços, almofadas e pés.
 * `seats` almofadas lado a lado dividem o vão entre os braços; a última absorve a sobra da divisão.
 */
function sofa(canvas: Canvas, ramp: Ramp, x0: number, y0: number, sofaWidth: number, seats: number): void {
  canvas.box(x0 + 3, y0 + 1, sofaWidth - 6, 8, ramp);
  canvas.hline(x0 + 4, y0 + 7, sofaWidth - 8, ramp.dark);
  const seatsWidth = sofaWidth - 8;
  const seatWidth = Math.floor(seatsWidth / seats);
  for (let i = 0; i < seats; i++) {
    const seatX = x0 + 4 + i * seatWidth;
    canvas.box(seatX, y0 + 8, i === seats - 1 ? seatsWidth - i * seatWidth : seatWidth, 5, ramp);
    if (i > 0) canvas.vline(seatX - 1, y0 + 9, 3, ramp.dark);
  }
  canvas.box(x0, y0 + 4, 5, 10, ramp);
  canvas.box(x0 + sofaWidth - 5, y0 + 4, 5, 10, ramp);
  canvas.vline(x0 + 4, y0 + 5, 8, ramp.dark).vline(x0 + sofaWidth - 5, y0 + 5, 8, ramp.light);
  canvas.hline(x0 + 1, y0 + 13, sofaWidth - 2, ramp.dark);
}

/** Desenha uma peça de várias células numa tela do tamanho dado e devolve os pixels. */
const make = (width: number, height: number, paint: (canvas: Canvas) => void) => {
  const canvas = new Canvas(width, height);
  paint(canvas);
  return canvas.toPixels();
};

// ---- 2x1 (32x16) ----

const sofa2 = (ramp: Ramp) =>
  make(32, 16, (canvas) => {
    sofa(canvas, ramp, 0, 0, 32, 2);
    canvas.outline(ramp.outline);
    canvas.rect(2, 14, 2, 1, ramp.outline).rect(28, 14, 2, 1, ramp.outline);
  });

const coffeeTable = make(32, 16, (canvas) => {
  canvas.box(2, 5, 28, 6, RAMPS.woodLight);
  canvas.rect(2, 10, 28, 2, 'peach');
  canvas.vline(3, 12, 3, 'clay').vline(28, 12, 3, 'clay');
  canvas.outline('clay');
  // Revistas e uma caneca em cima.
  canvas.rect(6, 6, 6, 3, 'sky').rect(7, 6, 4, 1, 'ice').rect(20, 6, 3, 3, 'white').px(23, 7, 'white');
});

const aquarium = make(32, 16, (canvas) => {
  canvas.box(1, 1, 30, 10, WATER);
  for (const [x, y, color] of [[8, 5, 'orange'], [9, 5, 'orange'], [20, 7, 'gold'], [21, 7, 'gold'], [14, 3, 'coral']] as const) canvas.px(x, y, color);
  canvas.vline(5, 6, 4, 'green').vline(6, 4, 6, 'emerald').vline(25, 5, 5, 'green').vline(26, 7, 3, 'leaf');
  canvas.hline(2, 9, 28, 'honey');
  canvas.box(0, 11, 32, 4, RAMPS.woodDark);
  canvas.outline('ink');
  canvas.hline(2, 2, 26, 'seafoam');
});

const bench = make(32, 16, (canvas) => {
  canvas.box(1, 6, 30, 4, RAMPS.woodLight);
  canvas.hline(1, 9, 30, 'peach');
  canvas.vline(3, 10, 4, 'clay').vline(28, 10, 4, 'clay');
  canvas.outline('clay');
});

const sideboard = make(32, 16, (canvas) => {
  canvas.box(1, 6, 30, 9, RAMPS.woodDark);
  canvas.vline(11, 7, 7, 'bark').vline(21, 7, 7, 'bark');
  canvas.px(9, 10, 'gold').px(13, 10, 'gold').px(19, 10, 'gold').px(23, 10, 'gold');
  canvas.outline('ink');
  // Vasinho e livros em cima.
  canvas.rect(5, 3, 4, 3, 'white').px(6, 1, 'leaf').px(7, 2, 'emerald').px(5, 2, 'emerald').px(8, 1, 'leaf');
  canvas.rect(20, 3, 2, 3, 'blue').rect(22, 2, 2, 4, 'coral').rect(24, 3, 2, 3, 'honey');
});

// ---- 2x2 (32x32) ----

const roundMeetingTable = make(32, 32, (canvas) => {
  const chairs: [number, number][] = [[13, 1], [13, 25], [1, 13], [25, 13]];
  for (const [x, y] of chairs) canvas.box(x, y, 6, 6, RAMPS.charcoal);
  canvas.outline('ink');
  const top = circle(16, 15, 10);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (top(x, y)) canvas.px(x, y, y < 12 ? 'white' : 'cream');
  canvas.outline('clay', (x, y) => top(x, y));
  canvas.hline(12, 25, 8, 'peach');
  canvas.rect(13, 10, 3, 3, 'sky').rect(18, 15, 4, 2, 'white');
});

const tallBookshelf = make(32, 32, (canvas) => {
  canvas.box(1, 0, 30, 32, RAMPS.woodDark);
  const colors: ColorName[] = ['blue', 'coral', 'emerald', 'honey', 'violet', 'rose', 'sky', 'leaf', 'mint'];
  // Quatro prateleiras; vãos e alturas alternadas pela posição, cores espalhadas pela mesma fórmula.
  for (const top of [2, 10, 18, 25]) {
    for (let x = 3; x < 29; x++) {
      if ((x * 7 + top) % 9 === 0) continue;
      const bookHeight = 5 - ((x + top) % 2);
      canvas.vline(x, top + (6 - bookHeight), bookHeight, colors[(x * 5 + top) % colors.length] ?? 'blue');
    }
    canvas.hline(2, top + 6, 28, 'bark');
  }
  canvas.rect(20, 11, 4, 5, 'white').px(21, 9, 'leaf').px(22, 10, 'emerald').px(20, 10, 'emerald');
  canvas.outline('ink');
});

const fridge = make(32, 32, (canvas) => {
  canvas.box(8, 0, 16, 31, RAMPS.white);
  canvas.hline(9, 11, 14, 'gray');
  canvas.vline(21, 3, 6, 'dusk').vline(21, 14, 9, 'dusk');
  canvas.rect(11, 15, 3, 3, 'lemon').rect(15, 16, 3, 2, 'pink');
  canvas.outline('dusk');
});

const bigTree = make(32, 32, (canvas) => {
  const crown = any(circle(16, 10, 9), circle(9, 14, 6), circle(23, 14, 6), circle(16, 4, 5));
  canvas.blob((x, y) => y < 22 && crown(x, y), RAMPS.leaf, { x: 12, y: 6, r: 12 });
  canvas.outline(RAMPS.leaf.outline);
  canvas.rect(14, 21, 4, 8, 'rust').vline(14, 21, 8, 'bark').vline(17, 21, 8, 'clay');
  canvas.hline(11, 29, 10, 'bark');
});

const vendingMachine = make(32, 32, (canvas) => {
  canvas.box(4, 0, 24, 31, RED);
  canvas.rect(7, 3, 14, 20, 'ice');
  const snacks: ColorName[] = ['gold', 'emerald', 'coral', 'violet', 'sky', 'honey'];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) canvas.rect(8 + column * 3, 4 + row * 5, 2, 3, snacks[(row * 4 + column) % snacks.length] ?? 'gold');
    canvas.hline(7, 7 + row * 5, 14, 'gray');
  }
  canvas.rect(22, 6, 4, 6, 'shadow').px(23, 7, 'leaf').px(24, 9, 'red');
  canvas.rect(8, 25, 12, 3, 'shadow');
  canvas.outline('maroon');
});

const arcade = make(32, 32, (canvas) => {
  canvas.box(7, 0, 18, 31, { outline: 'grape', dark: 'violet', base: 'purple', light: 'lavender' });
  canvas.rect(10, 4, 12, 9, 'navy').rect(11, 5, 10, 7, 'deepteal');
  canvas.px(13, 8, 'gold').px(17, 7, 'hotpink').px(15, 10, 'mint').hline(12, 6, 3, 'seafoam');
  canvas.rect(9, 15, 14, 4, 'shadow').px(12, 16, 'red').px(16, 16, 'sky').px(18, 17, 'gold');
  canvas.hline(10, 3, 12, 'lilac');
  canvas.outline('grape');
});

const bigPlanter = make(32, 32, (canvas) => {
  const leaves = any(circle(10, 10, 7), circle(22, 10, 7), circle(16, 15, 7), circle(16, 5, 5));
  canvas.blob((x, y) => y < 22 && leaves(x, y), RAMPS.leaf, { x: 12, y: 6, r: 12 });
  canvas.outline(RAMPS.leaf.outline);
  for (const [x, y] of [[9, 10], [10, 11], [21, 9], [22, 10], [16, 16], [15, 15], [16, 5]] as const) canvas.px(x, y, 'pine');
  canvas.box(8, 21, 16, 3, RAMPS.potWhite);
  canvas.box(9, 24, 14, 7, RAMPS.potWhite);
  canvas.outline(RAMPS.potWhite.outline, (_x, y) => y >= 21);
});

const whiteboardStand = make(32, 32, (canvas) => {
  canvas.rect(2, 2, 28, 18, 'white');
  canvas.hline(5, 5, 12, 'blue').hline(5, 8, 18, 'sky').hline(5, 11, 9, 'red').hline(5, 14, 14, 'blue');
  canvas.rect(20, 10, 6, 6, 'ice');
  canvas.outline('gray');
  canvas.vline(5, 20, 9, 'dusk').vline(26, 20, 9, 'dusk');
  canvas.hline(2, 29, 7, 'dusk').hline(23, 29, 7, 'dusk');
  canvas.hline(4, 20, 24, 'gray').px(8, 20, 'red').px(11, 20, 'blue');
});

// ---- 3x2 (48x32) ----

const meetingTable = make(48, 32, (canvas) => {
  for (const x of [9, 21, 33]) {
    canvas.box(x, 0, 6, 6, RAMPS.charcoal);
    canvas.box(x, 26, 6, 6, RAMPS.charcoal);
  }
  canvas.outline('ink');
  canvas.box(3, 6, 42, 17, RAMPS.woodLight);
  canvas.rect(3, 21, 42, 3, 'peach');
  canvas.outline('clay', (_x, y) => y >= 6 && y <= 23);
  canvas.rect(8, 10, 5, 4, 'white').rect(22, 13, 6, 3, 'sky').rect(35, 9, 3, 3, 'white').px(38, 10, 'white');
});

const kitchenCounter = make(48, 32, (canvas) => {
  canvas.box(0, 8, 48, 8, RAMPS.white);
  canvas.box(0, 16, 48, 15, { outline: 'slate', dark: 'fern', base: 'sage', light: 'celery' });
  canvas.vline(16, 17, 13, 'fern').vline(32, 17, 13, 'fern');
  canvas.hline(6, 22, 4, 'gray').hline(22, 22, 4, 'gray').hline(38, 22, 4, 'gray');
  // Pia, cafeteira e fruteira.
  canvas.rect(5, 10, 10, 4, 'gray').rect(6, 11, 8, 2, 'mist').vline(10, 6, 4, 'dusk').px(11, 6, 'dusk');
  canvas.rect(22, 3, 6, 9, 'shadow').rect(23, 9, 3, 3, 'white').px(26, 4, 'red');
  canvas.rect(35, 10, 8, 3, 'white').px(36, 9, 'red').px(38, 9, 'gold').px(40, 9, 'leaf').px(37, 8, 'orange');
  canvas.outline('dusk');
});

const pingPong = make(48, 32, (canvas) => {
  canvas.box(2, 4, 44, 20, TABLE_GREEN);
  canvas.vline(23, 4, 20, 'white').hline(3, 13, 42, 'white');
  canvas.rect(23, 2, 2, 24, 'mist');
  canvas.rect(2, 23, 44, 2, 'green');
  canvas.vline(4, 25, 5, 'dusk').vline(43, 25, 5, 'dusk').vline(21, 25, 5, 'dusk').vline(26, 25, 5, 'dusk');
  canvas.outline('pine');
  canvas.rect(10, 8, 3, 3, 'red').rect(36, 17, 3, 3, 'sky').px(30, 9, 'white');
});

const lSofa = make(48, 32, (canvas) => {
  const ramp = RAMPS.fabricPeach;
  sofa(canvas, ramp, 0, 0, 48, 3);
  canvas.box(36, 13, 12, 18, ramp);
  canvas.hline(37, 22, 10, ramp.dark);
  canvas.outline(ramp.outline);
  canvas.rect(2, 14, 2, 1, ramp.outline).rect(44, 31, 2, 1, ramp.outline);
});

const receptionDesk = make(48, 32, (canvas) => {
  canvas.box(0, 10, 48, 6, RAMPS.white);
  canvas.box(0, 16, 48, 14, { outline: 'navy', dark: 'indigo', base: 'blue', light: 'sky' });
  canvas.hline(4, 22, 40, 'sky');
  canvas.rect(28, 3, 10, 7, 'shadow').rect(29, 4, 8, 5, 'sky').rect(32, 9, 2, 2, 'dusk');
  canvas.rect(8, 11, 6, 3, 'leaf').px(9, 10, 'emerald').px(12, 10, 'emerald');
  canvas.outline('dusk', (_x, y) => y < 16);
  canvas.outline('navy', (_x, y) => y >= 16);
});

const foosball = make(48, 32, (canvas) => {
  canvas.box(4, 6, 40, 18, TABLE_GREEN);
  canvas.rect(4, 6, 40, 2, 'bark').rect(4, 22, 40, 2, 'bark');
  canvas.vline(23, 8, 14, 'white');
  for (const x of [10, 16, 30, 36]) {
    canvas.vline(x, 2, 26, 'gray');
    for (const y of [11, 15, 19]) canvas.px(x, y, x < 24 ? 'red' : 'blue');
  }
  canvas.vline(6, 24, 6, 'bark').vline(41, 24, 6, 'bark');
  canvas.outline('ink');
});

/** Tileset `furniture-2x1`: célula 32x16. */
export const FURNITURE_2X1: TileArt[] = [
  { pixels: sofa2(RAMPS.fabricPeach), collides: true, itemId: 'sofa-peach' },
  { pixels: sofa2(RAMPS.fabricSage), collides: true, itemId: 'sofa-sage' },
  { pixels: coffeeTable, collides: true, itemId: 'coffee-table' },
  { pixels: aquarium, collides: true, itemId: 'aquarium' },
  { pixels: bench, collides: true, itemId: 'bench' },
  { pixels: sideboard, collides: true, itemId: 'sideboard' },
  { pixels: sofa2(BLUE), collides: true, itemId: 'sofa-blue' },
];

/** Tileset `furniture-2x2`: célula 32x32. */
export const FURNITURE_2X2: TileArt[] = [
  { pixels: roundMeetingTable, collides: true, itemId: 'meeting-table-round' },
  { pixels: tallBookshelf, collides: true, itemId: 'bookshelf-tall' },
  { pixels: fridge, collides: true, itemId: 'fridge' },
  { pixels: bigTree, collides: true, itemId: 'tree' },
  { pixels: vendingMachine, collides: true, itemId: 'vending-machine' },
  { pixels: arcade, collides: true, itemId: 'arcade' },
  { pixels: bigPlanter, collides: true, itemId: 'planter' },
  { pixels: whiteboardStand, collides: true, itemId: 'whiteboard' },
];

/** Tileset `furniture-3x2`: célula 48x32. */
export const FURNITURE_3X2: TileArt[] = [
  { pixels: meetingTable, collides: true, itemId: 'meeting-table-long' },
  { pixels: kitchenCounter, collides: true, itemId: 'kitchen-counter' },
  { pixels: pingPong, collides: true, itemId: 'ping-pong' },
  { pixels: lSofa, collides: true, itemId: 'sofa-l' },
  { pixels: receptionDesk, collides: true, itemId: 'reception' },
  { pixels: foosball, collides: true, itemId: 'foosball' },
];
