// Móveis de várias células, um objeto só no mapa (docs/art.md). Cada lista é um tileset com a
// célula do tamanho indicado; só acrescentar no fim. Luz de cima à esquerda, frente aparecendo.
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import type { ColorName } from '../lib/colors.ts';
import type { TileArt } from './tiles.ts';

const BLUE: Ramp = { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' };
const WATER: Ramp = { outline: 'deepteal', dark: 'teal', base: 'aqua', light: 'seafoam' };
const TABLE_GREEN: Ramp = { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf' };
const RED: Ramp = { outline: 'maroon', dark: 'crimson', base: 'red', light: 'salmon' };

const circle = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
const any =
  (...masks: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number) =>
    masks.some((m) => m(x, y));

/** Sofá visto de frente: encosto, braços, almofadas e pés. `seats` almofadas lado a lado. */
function sofa(c: Canvas, ramp: Ramp, x0: number, y0: number, w: number, seats: number): void {
  c.box(x0 + 3, y0 + 1, w - 6, 8, ramp);
  c.hline(x0 + 4, y0 + 7, w - 8, ramp.dark);
  const inner = w - 8;
  const each = Math.floor(inner / seats);
  for (let i = 0; i < seats; i++) {
    const sx = x0 + 4 + i * each;
    c.box(sx, y0 + 8, i === seats - 1 ? inner - i * each : each, 5, ramp);
    if (i > 0) c.vline(sx - 1, y0 + 9, 3, ramp.dark);
  }
  c.box(x0, y0 + 4, 5, 10, ramp);
  c.box(x0 + w - 5, y0 + 4, 5, 10, ramp);
  c.vline(x0 + 4, y0 + 5, 8, ramp.dark).vline(x0 + w - 5, y0 + 5, 8, ramp.light);
  c.hline(x0 + 1, y0 + 13, w - 2, ramp.dark);
}

const make = (w: number, h: number, fn: (c: Canvas) => void) => {
  const c = new Canvas(w, h);
  fn(c);
  return c.toPixels();
};

// ---- 2x1 (32x16) ----

const sofa2 = (ramp: Ramp) =>
  make(32, 16, (c) => {
    sofa(c, ramp, 0, 0, 32, 2);
    c.outline(ramp.outline);
    c.rect(2, 14, 2, 1, ramp.outline).rect(28, 14, 2, 1, ramp.outline);
  });

const coffeeTable = make(32, 16, (c) => {
  c.box(2, 5, 28, 6, RAMPS.woodLight);
  c.rect(2, 10, 28, 2, 'peach');
  c.vline(3, 12, 3, 'clay').vline(28, 12, 3, 'clay');
  c.outline('clay');
  // Revistas e uma caneca em cima.
  c.rect(6, 6, 6, 3, 'sky').rect(7, 6, 4, 1, 'ice').rect(20, 6, 3, 3, 'white').px(23, 7, 'white');
});

const aquarium = make(32, 16, (c) => {
  c.box(1, 1, 30, 10, WATER);
  for (const [x, y, color] of [[8, 5, 'orange'], [9, 5, 'orange'], [20, 7, 'gold'], [21, 7, 'gold'], [14, 3, 'coral']] as const) c.px(x, y, color);
  c.vline(5, 6, 4, 'green').vline(6, 4, 6, 'emerald').vline(25, 5, 5, 'green').vline(26, 7, 3, 'leaf');
  c.hline(2, 9, 28, 'honey');
  c.box(0, 11, 32, 4, RAMPS.woodDark);
  c.outline('ink');
  c.hline(2, 2, 26, 'seafoam');
});

const bench = make(32, 16, (c) => {
  c.box(1, 6, 30, 4, RAMPS.woodLight);
  c.hline(1, 9, 30, 'peach');
  c.vline(3, 10, 4, 'clay').vline(28, 10, 4, 'clay');
  c.outline('clay');
});

const sideboard = make(32, 16, (c) => {
  c.box(1, 6, 30, 9, RAMPS.woodDark);
  c.vline(11, 7, 7, 'bark').vline(21, 7, 7, 'bark');
  c.px(9, 10, 'gold').px(13, 10, 'gold').px(19, 10, 'gold').px(23, 10, 'gold');
  c.outline('ink');
  // Vasinho e livros em cima.
  c.rect(5, 3, 4, 3, 'white').px(6, 1, 'leaf').px(7, 2, 'emerald').px(5, 2, 'emerald').px(8, 1, 'leaf');
  c.rect(20, 3, 2, 3, 'blue').rect(22, 2, 2, 4, 'coral').rect(24, 3, 2, 3, 'honey');
});

// ---- 2x2 (32x32) ----

const roundMeetingTable = make(32, 32, (c) => {
  const chairs: [number, number][] = [[13, 1], [13, 25], [1, 13], [25, 13]];
  for (const [x, y] of chairs) c.box(x, y, 6, 6, RAMPS.charcoal);
  c.outline('ink');
  const top = circle(16, 15, 10);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (top(x, y)) c.px(x, y, y < 12 ? 'white' : 'cream');
  c.outline('clay', (x, y) => top(x, y));
  c.hline(12, 25, 8, 'peach');
  c.rect(13, 10, 3, 3, 'sky').rect(18, 15, 4, 2, 'white');
});

const tallBookshelf = make(32, 32, (c) => {
  c.box(1, 0, 30, 32, RAMPS.woodDark);
  const colors: ColorName[] = ['blue', 'coral', 'emerald', 'honey', 'violet', 'rose', 'sky', 'leaf', 'mint'];
  for (const top of [2, 10, 18, 25]) {
    for (let x = 3; x < 29; x++) {
      if ((x * 7 + top) % 9 === 0) continue;
      const h = 5 - ((x + top) % 2);
      c.vline(x, top + (6 - h), h, colors[(x * 5 + top) % colors.length] ?? 'blue');
    }
    c.hline(2, top + 6, 28, 'bark');
  }
  c.rect(20, 11, 4, 5, 'white').px(21, 9, 'leaf').px(22, 10, 'emerald').px(20, 10, 'emerald');
  c.outline('ink');
});

const fridge = make(32, 32, (c) => {
  c.box(8, 0, 16, 31, RAMPS.white);
  c.hline(9, 11, 14, 'gray');
  c.vline(21, 3, 6, 'dusk').vline(21, 14, 9, 'dusk');
  c.rect(11, 15, 3, 3, 'lemon').rect(15, 16, 3, 2, 'pink');
  c.outline('dusk');
});

const bigTree = make(32, 32, (c) => {
  const crown = any(circle(16, 10, 9), circle(9, 14, 6), circle(23, 14, 6), circle(16, 4, 5));
  c.blob((x, y) => y < 22 && crown(x, y), RAMPS.leaf, { x: 12, y: 6, r: 12 });
  c.outline(RAMPS.leaf.outline);
  c.rect(14, 21, 4, 8, 'rust').vline(14, 21, 8, 'bark').vline(17, 21, 8, 'clay');
  c.hline(11, 29, 10, 'bark');
});

const vendingMachine = make(32, 32, (c) => {
  c.box(4, 0, 24, 31, RED);
  c.rect(7, 3, 14, 20, 'ice');
  const snacks: ColorName[] = ['gold', 'emerald', 'coral', 'violet', 'sky', 'honey'];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) c.rect(8 + col * 3, 4 + row * 5, 2, 3, snacks[(row * 4 + col) % snacks.length] ?? 'gold');
    c.hline(7, 7 + row * 5, 14, 'gray');
  }
  c.rect(22, 6, 4, 6, 'shadow').px(23, 7, 'leaf').px(24, 9, 'red');
  c.rect(8, 25, 12, 3, 'shadow');
  c.outline('maroon');
});

const arcade = make(32, 32, (c) => {
  c.box(7, 0, 18, 31, { outline: 'grape', dark: 'violet', base: 'purple', light: 'lavender' });
  c.rect(10, 4, 12, 9, 'navy').rect(11, 5, 10, 7, 'deepteal');
  c.px(13, 8, 'gold').px(17, 7, 'hotpink').px(15, 10, 'mint').hline(12, 6, 3, 'seafoam');
  c.rect(9, 15, 14, 4, 'shadow').px(12, 16, 'red').px(16, 16, 'sky').px(18, 17, 'gold');
  c.hline(10, 3, 12, 'lilac');
  c.outline('grape');
});

const bigPlanter = make(32, 32, (c) => {
  const leaves = any(circle(10, 10, 7), circle(22, 10, 7), circle(16, 15, 7), circle(16, 5, 5));
  c.blob((x, y) => y < 22 && leaves(x, y), RAMPS.leaf, { x: 12, y: 6, r: 12 });
  c.outline(RAMPS.leaf.outline);
  for (const [x, y] of [[9, 10], [10, 11], [21, 9], [22, 10], [16, 16], [15, 15], [16, 5]] as const) c.px(x, y, 'pine');
  c.box(8, 21, 16, 3, RAMPS.potWhite);
  c.box(9, 24, 14, 7, RAMPS.potWhite);
  c.outline(RAMPS.potWhite.outline, (_x, y) => y >= 21);
});

const whiteboardStand = make(32, 32, (c) => {
  c.rect(2, 2, 28, 18, 'white');
  c.hline(5, 5, 12, 'blue').hline(5, 8, 18, 'sky').hline(5, 11, 9, 'red').hline(5, 14, 14, 'blue');
  c.rect(20, 10, 6, 6, 'ice');
  c.outline('gray');
  c.vline(5, 20, 9, 'dusk').vline(26, 20, 9, 'dusk');
  c.hline(2, 29, 7, 'dusk').hline(23, 29, 7, 'dusk');
  c.hline(4, 20, 24, 'gray').px(8, 20, 'red').px(11, 20, 'blue');
});

// ---- 3x2 (48x32) ----

const meetingTable = make(48, 32, (c) => {
  for (const x of [9, 21, 33]) {
    c.box(x, 0, 6, 6, RAMPS.charcoal);
    c.box(x, 26, 6, 6, RAMPS.charcoal);
  }
  c.outline('ink');
  c.box(3, 6, 42, 17, RAMPS.woodLight);
  c.rect(3, 21, 42, 3, 'peach');
  c.outline('clay', (_x, y) => y >= 6 && y <= 23);
  c.rect(8, 10, 5, 4, 'white').rect(22, 13, 6, 3, 'sky').rect(35, 9, 3, 3, 'white').px(38, 10, 'white');
});

const kitchenCounter = make(48, 32, (c) => {
  c.box(0, 8, 48, 8, RAMPS.white);
  c.box(0, 16, 48, 15, { outline: 'slate', dark: 'fern', base: 'sage', light: 'celery' });
  c.vline(16, 17, 13, 'fern').vline(32, 17, 13, 'fern');
  c.hline(6, 22, 4, 'gray').hline(22, 22, 4, 'gray').hline(38, 22, 4, 'gray');
  // Pia, cafeteira e fruteira.
  c.rect(5, 10, 10, 4, 'gray').rect(6, 11, 8, 2, 'mist').vline(10, 6, 4, 'dusk').px(11, 6, 'dusk');
  c.rect(22, 3, 6, 9, 'shadow').rect(23, 9, 3, 3, 'white').px(26, 4, 'red');
  c.rect(35, 10, 8, 3, 'white').px(36, 9, 'red').px(38, 9, 'gold').px(40, 9, 'leaf').px(37, 8, 'orange');
  c.outline('dusk');
});

const pingPong = make(48, 32, (c) => {
  c.box(2, 4, 44, 20, TABLE_GREEN);
  c.vline(23, 4, 20, 'white').hline(3, 13, 42, 'white');
  c.rect(23, 2, 2, 24, 'mist');
  c.rect(2, 23, 44, 2, 'green');
  c.vline(4, 25, 5, 'dusk').vline(43, 25, 5, 'dusk').vline(21, 25, 5, 'dusk').vline(26, 25, 5, 'dusk');
  c.outline('pine');
  c.rect(10, 8, 3, 3, 'red').rect(36, 17, 3, 3, 'sky').px(30, 9, 'white');
});

const lSofa = make(48, 32, (c) => {
  const ramp = RAMPS.fabricPeach;
  sofa(c, ramp, 0, 0, 48, 3);
  c.box(36, 13, 12, 18, ramp);
  c.hline(37, 22, 10, ramp.dark);
  c.outline(ramp.outline);
  c.rect(2, 14, 2, 1, ramp.outline).rect(44, 31, 2, 1, ramp.outline);
});

const receptionDesk = make(48, 32, (c) => {
  c.box(0, 10, 48, 6, RAMPS.white);
  c.box(0, 16, 48, 14, { outline: 'navy', dark: 'indigo', base: 'blue', light: 'sky' });
  c.hline(4, 22, 40, 'sky');
  c.rect(28, 3, 10, 7, 'shadow').rect(29, 4, 8, 5, 'sky').rect(32, 9, 2, 2, 'dusk');
  c.rect(8, 11, 6, 3, 'leaf').px(9, 10, 'emerald').px(12, 10, 'emerald');
  c.outline('dusk', (_x, y) => y < 16);
  c.outline('navy', (_x, y) => y >= 16);
});

const foosball = make(48, 32, (c) => {
  c.box(4, 6, 40, 18, TABLE_GREEN);
  c.rect(4, 6, 40, 2, 'bark').rect(4, 22, 40, 2, 'bark');
  c.vline(23, 8, 14, 'white');
  for (const x of [10, 16, 30, 36]) {
    c.vline(x, 2, 26, 'gray');
    for (const y of [11, 15, 19]) c.px(x, y, x < 24 ? 'red' : 'blue');
  }
  c.vline(6, 24, 6, 'bark').vline(41, 24, 6, 'bark');
  c.outline('ink');
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
