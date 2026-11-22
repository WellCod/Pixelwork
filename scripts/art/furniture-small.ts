// Móveis de 16x16 no padrão novo (docs/art.md, guia de estilo). Ancorados no canto inferior
// esquerdo; a frente do móvel aparece (3/4 leve) e a luz vem de cima à esquerda.
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import { mirror, type Pixels } from '../lib/pixels.ts';
import { officeChair, pottedPlant } from './office.ts';

const T = 16;
const draw = (fn: (c: Canvas) => void): Pixels => {
  const c = new Canvas(T, T);
  fn(c);
  return c.toPixels();
};
const circle = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r;
const any =
  (...masks: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number) =>
    masks.some((m) => m(x, y));

const BLUE: Ramp = { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' };
const PINK: Ramp = { outline: 'berry', dark: 'rose', base: 'pink', light: 'peach' };
const YELLOW: Ramp = { outline: 'rust', dark: 'amber', base: 'gold', light: 'lemon' };
const CACTUS: Ramp = { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf' };

/** Vaso padrão na base do tile (boca de `w` px), com contorno do próprio material. */
function pot(c: Canvas, ramp: Ramp, w = 8, top = 11): void {
  const x = Math.floor((T - w) / 2);
  c.box(x, top, w, 2, ramp);
  c.box(x + 1, top + 2, w - 2, T - top - 3, ramp);
  c.outline(ramp.outline, (_x, y) => y >= top);
}

// ---- redesenho dos frames existentes (0-11, mesma ordem e sentido) ----

export const desk = draw((c) => {
  c.box(1, 3, 14, 8, RAMPS.woodLight);
  c.rect(1, 10, 14, 2, 'peach');
  c.rect(2, 12, 1, 3, 'clay').rect(13, 12, 1, 3, 'clay');
  c.outline('clay');
});

/** Mesa em madeira escura (variante `dark` do desk-decor). */
export const deskDarkWood = draw((c) => {
  c.box(1, 3, 14, 8, RAMPS.woodDark);
  c.rect(1, 10, 14, 2, 'bark');
  c.rect(2, 12, 1, 3, 'ink').rect(13, 12, 1, 3, 'ink');
  c.outline('ink');
});

export const loveseat = draw((c) => {
  const r = RAMPS.fabricPeach;
  c.box(2, 3, 12, 6, r);
  c.box(3, 8, 10, 4, r);
  c.box(0, 5, 4, 8, r).box(12, 5, 4, 8, r);
  c.hline(1, 12, 14, r.dark);
  c.outline(r.outline);
});

/** Pedaço de mesa de reunião que emenda com os vizinhos: madeira sem contorno. */
export const meetingTableTile = draw((c) => {
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) c.px(x, y, y % 8 === 7 ? 'peach' : y % 8 === 0 ? 'white' : 'cream');
  }
});

export const door = draw((c) => {
  c.rect(0, 0, 2, 16, 'mist').rect(14, 0, 2, 16, 'mist');
  c.box(2, 0, 12, 16, RAMPS.woodLight);
  c.rect(4, 2, 8, 5, 'peach').rect(5, 3, 6, 3, 'cream');
  c.rect(4, 9, 8, 5, 'peach').rect(5, 10, 6, 3, 'cream');
  c.px(11, 8, 'gold').px(12, 8, 'amber');
  c.vline(1, 0, 16, 'gray').vline(14, 0, 16, 'gray');
});

export const bookshelf = draw((c) => {
  c.box(1, 0, 14, 16, RAMPS.woodDark);
  const books: [number, number, string][] = [];
  const colors = ['blue', 'coral', 'emerald', 'honey', 'violet', 'rose', 'sky', 'leaf'] as const;
  for (const [row, top] of [
    [0, 1],
    [1, 6],
    [2, 11],
  ] as const) {
    for (let x = 2; x < 14; x++) {
      if ((x + row * 3) % 5 === 4) continue;
      books.push([x, top + ((x + row) % 2), colors[(x * 3 + row * 5) % colors.length] ?? 'blue']);
    }
  }
  for (const [x, top, color] of books) c.vline(x, top, 5 - ((x + top) % 2) - 1, color as (typeof colors)[number]);
  c.hline(1, 5, 14, 'bark').hline(1, 10, 14, 'bark').hline(1, 15, 14, 'bark');
  c.outline('ink');
});

export const waterCooler = draw((c) => {
  c.box(5, 1, 6, 6, BLUE);
  c.px(6, 2, 'white');
  c.box(4, 7, 8, 8, RAMPS.white);
  c.px(6, 9, 'blue').px(9, 9, 'red');
  c.rect(5, 11, 6, 2, 'gray');
  c.outline('dusk');
});

export const coffeeMachine = draw((c) => {
  c.box(3, 2, 10, 12, RAMPS.charcoal);
  c.rect(5, 4, 6, 3, 'shadow').px(10, 3, 'red').px(9, 3, 'leaf');
  c.rect(7, 7, 2, 1, 'gray');
  c.rect(6, 10, 4, 3, 'white').px(10, 11, 'white').px(7, 9, 'mist');
  c.hline(3, 14, 10, 'shadow');
  c.outline('ink');
});

export const armchair = draw((c) => {
  const r = RAMPS.fabricSage;
  c.box(3, 3, 10, 6, r);
  c.box(4, 8, 8, 4, r);
  c.box(1, 5, 4, 8, r).box(11, 5, 4, 8, r);
  c.hline(2, 12, 12, r.dark);
  c.outline(r.outline);
});

/** Capacho oval (o tapete-objeto antigo, sem colisão). */
export const doormat = draw((c) => {
  const oval = (x: number, y: number) => ((x + 0.5 - 8) / 7) ** 2 + ((y + 0.5 - 11.5) / 3.5) ** 2 <= 1;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (oval(x, y)) c.px(x, y, 'lavender');
  c.outline('violet');
  for (let x = 3; x < 13; x += 2) c.px(x, 11, 'lilac');
});

export const tallPlant = draw((c) => {
  const leaves = any(circle(8, 4, 3.6), circle(5, 7, 3.2), circle(11, 7, 3.2), circle(8, 8.5, 3));
  c.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 7, y: 4, r: 6 });
  c.outline(RAMPS.leaf.outline);
  pot(c, RAMPS.potClay, 8, 11);
});

// ---- peças novas (do frame 12 em diante) ----

export const officeChairBack = draw((c) => {
  c.box(4, 2, 8, 9, RAMPS.charcoal);
  c.hline(5, 4, 6, 'shadow');
  c.box(3, 9, 10, 3, RAMPS.charcoal);
  c.outline('ink');
  c.vline(7, 12, 1, 'gray').vline(8, 12, 1, 'ink');
  c.hline(5, 13, 6, 'ink').px(4, 14, 'ink').px(11, 14, 'ink').px(7, 14, 'ink');
});

export const officeChairSide = draw((c) => {
  c.box(10, 2, 3, 9, RAMPS.charcoal);
  c.box(3, 8, 9, 3, RAMPS.charcoal);
  c.outline('ink');
  c.vline(7, 11, 2, 'gray');
  c.hline(4, 13, 7, 'ink').px(4, 14, 'ink').px(10, 14, 'ink');
});

export const kitchenChair = draw((c) => {
  const r = RAMPS.woodLight;
  c.box(4, 2, 8, 2, r).box(4, 5, 8, 2, r);
  c.vline(4, 2, 7, r.dark).vline(11, 2, 7, r.dark);
  c.box(3, 8, 10, 3, r);
  c.vline(4, 11, 4, 'peach').vline(11, 11, 4, 'peach');
  c.outline(r.outline);
});

function beanbag(ramp: Ramp): Pixels {
  return draw((c) => {
    const mask = any(circle(8, 10, 6), circle(8, 6.5, 4.2));
    c.blob(mask, ramp, { x: 6, y: 6, r: 7 });
    c.outline(ramp.outline);
  });
}
export const beanbagBlue = beanbag(BLUE);
export const beanbagPink = beanbag(PINK);
export const beanbagYellow = beanbag(YELLOW);

export const cactus = draw((c) => {
  const body = (x: number, y: number) =>
    (x >= 6 && x <= 9 && y >= 2 && y <= 11) || (x >= 3 && x <= 5 && y >= 5 && y <= 8) || (x === 3 && y >= 3 && y <= 5) ||
    (x >= 10 && x <= 12 && y >= 6 && y <= 8) || (x === 12 && y >= 4 && y <= 6);
  c.blob(body, CACTUS, { x: 6, y: 4, r: 6 });
  c.outline(CACTUS.outline);
  c.px(7, 4, 'sprout').px(8, 7, 'sprout').px(7, 1, 'pink');
  pot(c, RAMPS.potClay, 8, 11);
});

export const monstera = draw((c) => {
  const leaves = any(circle(5, 5, 4), circle(11, 5, 4), circle(8, 8, 4), circle(8, 2.5, 2.5));
  c.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 6, y: 3, r: 7 });
  c.outline(RAMPS.leaf.outline);
  // Recortes da folha de costela-de-adão.
  for (const [x, y] of [[4, 5], [5, 6], [11, 4], [10, 5], [8, 9], [7, 3]] as const) c.px(x, y, 'pine');
  pot(c, RAMPS.potWhite, 8, 11);
});

export const snakePlant = draw((c) => {
  const blades: [number, number][] = [[5, 4], [6, 1], [7, 3], [8, 0], [9, 2], [10, 5]];
  for (const [x, top] of blades) {
    for (let y = top; y < 12; y++) c.px(x, y, y % 3 === 0 ? 'sprout' : (x + y) % 2 === 0 ? 'green' : 'emerald');
  }
  c.outline('pine');
  pot(c, RAMPS.metal, 8, 11);
});

export const flowerPot = draw((c) => {
  const leaves = any(circle(8, 7, 4.5), circle(5, 9, 2.5), circle(11, 9, 2.5));
  c.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 7, y: 5, r: 6 });
  c.outline(RAMPS.leaf.outline);
  for (const [x, y, color] of [[6, 4, 'pink'], [9, 5, 'white'], [7, 7, 'hotpink'], [10, 8, 'pink'], [5, 8, 'white'], [8, 3, 'lemon']] as const) c.px(x, y, color);
  pot(c, RAMPS.potClay, 8, 11);
});

export const ficus = draw((c) => {
  c.blob(circle(8, 5, 5), RAMPS.leaf, { x: 6, y: 3, r: 6 });
  c.outline(RAMPS.leaf.outline);
  c.vline(7, 10, 2, 'bark').vline(8, 10, 2, 'rust');
  pot(c, RAMPS.potWhite, 8, 12);
});

export const succulent = draw((c) => {
  const rosette = any(circle(8, 10, 3.2), circle(6, 9, 1.6), circle(10, 9, 1.6), circle(8, 7.5, 1.6));
  c.blob(rosette, { outline: 'slate', dark: 'fern', base: 'sage', light: 'celery', shine: 'mist' }, { x: 7, y: 8, r: 3 });
  c.outline('slate');
  c.box(5, 12, 6, 3, RAMPS.potClay);
  c.outline('rust', (_x, y) => y >= 12);
});

export const floorLamp = draw((c) => {
  // Cúpula em trapézio, acesa por dentro (mais clara embaixo).
  c.hline(6, 1, 4, 'cream').hline(5, 2, 6, 'cream').hline(5, 3, 6, 'white').hline(4, 4, 8, 'lemon');
  c.outline('tan');
  c.vline(7, 5, 9, 'dusk').vline(8, 5, 9, 'gray');
  c.box(5, 14, 6, 1, RAMPS.charcoal);
  c.px(5, 14, 'ink').px(10, 14, 'ink');
});

export const trashBin = draw((c) => {
  c.box(4, 6, 8, 9, RAMPS.metal);
  c.hline(4, 6, 8, 'white').hline(5, 7, 6, 'dusk');
  c.vline(6, 9, 4, 'mist').vline(9, 9, 4, 'gray');
  c.outline('shadow');
  c.px(7, 5, 'white').px(8, 4, 'mist');
});

export const printer = draw((c) => {
  c.box(2, 4, 12, 6, RAMPS.white);
  c.rect(4, 3, 8, 2, 'white').rect(4, 5, 8, 1, 'gray');
  c.px(12, 6, 'leaf').px(11, 6, 'sky');
  c.box(3, 10, 10, 5, RAMPS.charcoal);
  c.hline(4, 12, 8, 'shadow');
  c.outline('dusk', (_x, y) => y < 10);
  c.outline('ink', (_x, y) => y >= 10);
});

export const coatRack = draw((c) => {
  c.vline(7, 2, 12, 'rust').vline(8, 2, 12, 'clay');
  c.px(5, 2, 'rust').px(10, 2, 'rust').px(6, 1, 'rust').px(9, 1, 'rust');
  c.box(3, 3, 4, 7, PINK);
  c.box(9, 3, 4, 5, BLUE);
  c.hline(5, 14, 6, 'bark');
  c.outline('ink', (x, y) => y >= 3 && y <= 10 && (x <= 6 || x >= 9));
});

export const fireExtinguisher = draw((c) => {
  c.box(5, 4, 6, 11, { outline: 'maroon', dark: 'crimson', base: 'red', light: 'salmon' });
  c.rect(6, 7, 4, 3, 'white').hline(6, 8, 4, 'red');
  c.outline('maroon');
  c.rect(6, 2, 3, 2, 'ink').px(9, 2, 'shadow').px(10, 3, 'shadow').px(11, 4, 'shadow').px(11, 5, 'shadow');
});

export const cardboardBox = draw((c) => {
  c.box(2, 5, 12, 10, RAMPS.potClay);
  c.hline(2, 8, 12, 'clay');
  c.vline(7, 5, 3, 'cream').vline(8, 5, 3, 'cream');
  c.outline('rust');
});

export const barStool = draw((c) => {
  c.box(4, 4, 8, 3, RAMPS.woodLight);
  c.outline('rust');
  c.vline(7, 7, 6, 'dusk').vline(8, 7, 6, 'gray');
  c.hline(5, 11, 6, 'gray');
  c.box(5, 13, 6, 2, RAMPS.charcoal);
  c.outline('ink', (_x, y) => y >= 13);
});

export const sideTable = draw((c) => {
  const top = (x: number, y: number) => ((x + 0.5 - 8) / 6) ** 2 + ((y + 0.5 - 7) / 3) ** 2 <= 1;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (top(x, y)) c.px(x, y, y < 6 ? 'cream' : 'honey');
  c.outline('rust');
  c.vline(7, 10, 4, 'tan').vline(8, 10, 4, 'rust');
  c.hline(5, 14, 6, 'rust');
  c.rect(9, 4, 3, 3, 'white').px(12, 5, 'white').px(10, 4, 'mist');
});

export { officeChair, pottedPlant };
export const officeChairRight = mirror(officeChairSide);
