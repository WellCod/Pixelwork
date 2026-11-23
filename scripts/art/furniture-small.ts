// Móveis de 16x16 no padrão novo (docs/art.md, guia de estilo). Ancorados no canto inferior
// esquerdo; a frente do móvel aparece (3/4 leve) e a luz vem de cima à esquerda.
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import { mirror, type Pixels } from '../lib/pixels.ts';
import { officeChair, pottedPlant } from './office.ts';

const TILE = 16;
/** Desenha um tile 16x16 numa tela nova e devolve os pixels. */
const draw = (paint: (canvas: Canvas) => void): Pixels => {
  const canvas = new Canvas(TILE, TILE);
  paint(canvas);
  return canvas.toPixels();
};
/** Máscara de círculo, testada no centro do pixel (+0,5). */
const circle = (centerX: number, centerY: number, radius: number) => (x: number, y: number) =>
  Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) <= radius;
/** União de máscaras: o pixel entra se estiver em qualquer uma. */
const any =
  (...masks: ((x: number, y: number) => boolean)[]) =>
  (x: number, y: number) =>
    masks.some((mask) => mask(x, y));

const BLUE: Ramp = { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' };
const PINK: Ramp = { outline: 'berry', dark: 'rose', base: 'pink', light: 'peach' };
const YELLOW: Ramp = { outline: 'rust', dark: 'amber', base: 'gold', light: 'lemon' };
const CACTUS: Ramp = { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf' };

/**
 * Vaso padrão na base do tile (boca de `mouthWidth` px), centrado, com contorno do próprio material:
 * boca de 2 px de altura em `top` e corpo 1 px mais estreito de cada lado até 1 px acima da base.
 */
function pot(canvas: Canvas, ramp: Ramp, mouthWidth = 8, top = 11): void {
  const x = Math.floor((TILE - mouthWidth) / 2);
  canvas.box(x, top, mouthWidth, 2, ramp);
  canvas.box(x + 1, top + 2, mouthWidth - 2, TILE - top - 3, ramp);
  canvas.outline(ramp.outline, (_x, y) => y >= top);
}

// ---- redesenho dos frames existentes (0-11, mesma ordem e sentido) ----

export const desk = draw((canvas) => {
  canvas.box(1, 3, 14, 8, RAMPS.woodLight);
  canvas.rect(1, 10, 14, 2, 'peach');
  canvas.rect(2, 12, 1, 3, 'clay').rect(13, 12, 1, 3, 'clay');
  canvas.outline('clay');
});

/** Mesa em madeira escura (variante `dark` do desk-decor). */
export const deskDarkWood = draw((canvas) => {
  canvas.box(1, 3, 14, 8, RAMPS.woodDark);
  canvas.rect(1, 10, 14, 2, 'bark');
  canvas.rect(2, 12, 1, 3, 'ink').rect(13, 12, 1, 3, 'ink');
  canvas.outline('ink');
});

export const loveseat = draw((canvas) => {
  const material = RAMPS.fabricPeach;
  canvas.box(2, 3, 12, 6, material);
  canvas.box(3, 8, 10, 4, material);
  canvas.box(0, 5, 4, 8, material).box(12, 5, 4, 8, material);
  canvas.hline(1, 12, 14, material.dark);
  canvas.outline(material.outline);
});

/** Pedaço de mesa de reunião que emenda com os vizinhos: madeira sem contorno. */
export const meetingTableTile = draw((canvas) => {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) canvas.px(x, y, y % 8 === 7 ? 'peach' : y % 8 === 0 ? 'white' : 'cream');
  }
});

export const door = draw((canvas) => {
  canvas.rect(0, 0, 2, 16, 'mist').rect(14, 0, 2, 16, 'mist');
  canvas.box(2, 0, 12, 16, RAMPS.woodLight);
  canvas.rect(4, 2, 8, 5, 'peach').rect(5, 3, 6, 3, 'cream');
  canvas.rect(4, 9, 8, 5, 'peach').rect(5, 10, 6, 3, 'cream');
  canvas.px(11, 8, 'gold').px(12, 8, 'amber');
  canvas.vline(1, 0, 16, 'gray').vline(14, 0, 16, 'gray');
});

export const bookshelf = draw((canvas) => {
  canvas.box(1, 0, 14, 16, RAMPS.woodDark);
  // Três prateleiras (topo em y = 1, 6 e 11), um livro por coluna: a fórmula com o índice da
  // prateleira abre vãos, alterna a altura em 1 px e espalha as cores sem padrão visível.
  const books: [number, number, string][] = [];
  const colors = ['blue', 'coral', 'emerald', 'honey', 'violet', 'rose', 'sky', 'leaf'] as const;
  for (const [shelf, top] of [
    [0, 1],
    [1, 6],
    [2, 11],
  ] as const) {
    for (let x = 2; x < 14; x++) {
      if ((x + shelf * 3) % 5 === 4) continue;
      books.push([x, top + ((x + shelf) % 2), colors[(x * 3 + shelf * 5) % colors.length] ?? 'blue']);
    }
  }
  for (const [x, top, color] of books) canvas.vline(x, top, 5 - ((x + top) % 2) - 1, color as (typeof colors)[number]);
  canvas.hline(1, 5, 14, 'bark').hline(1, 10, 14, 'bark').hline(1, 15, 14, 'bark');
  canvas.outline('ink');
});

export const waterCooler = draw((canvas) => {
  canvas.box(5, 1, 6, 6, BLUE);
  canvas.px(6, 2, 'white');
  canvas.box(4, 7, 8, 8, RAMPS.white);
  canvas.px(6, 9, 'blue').px(9, 9, 'red');
  canvas.rect(5, 11, 6, 2, 'gray');
  canvas.outline('dusk');
});

export const coffeeMachine = draw((canvas) => {
  canvas.box(3, 2, 10, 12, RAMPS.charcoal);
  canvas.rect(5, 4, 6, 3, 'shadow').px(10, 3, 'red').px(9, 3, 'leaf');
  canvas.rect(7, 7, 2, 1, 'gray');
  canvas.rect(6, 10, 4, 3, 'white').px(10, 11, 'white').px(7, 9, 'mist');
  canvas.hline(3, 14, 10, 'shadow');
  canvas.outline('ink');
});

export const armchair = draw((canvas) => {
  const material = RAMPS.fabricSage;
  canvas.box(3, 3, 10, 6, material);
  canvas.box(4, 8, 8, 4, material);
  canvas.box(1, 5, 4, 8, material).box(11, 5, 4, 8, material);
  canvas.hline(2, 12, 12, material.dark);
  canvas.outline(material.outline);
});

/** Capacho oval (o tapete-objeto antigo, sem colisão). */
export const doormat = draw((canvas) => {
  const oval = (x: number, y: number) => ((x + 0.5 - 8) / 7) ** 2 + ((y + 0.5 - 11.5) / 3.5) ** 2 <= 1;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (oval(x, y)) canvas.px(x, y, 'lavender');
  canvas.outline('violet');
  for (let x = 3; x < 13; x += 2) canvas.px(x, 11, 'lilac');
});

export const tallPlant = draw((canvas) => {
  const leaves = any(circle(8, 4, 3.6), circle(5, 7, 3.2), circle(11, 7, 3.2), circle(8, 8.5, 3));
  canvas.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 7, y: 4, r: 6 });
  canvas.outline(RAMPS.leaf.outline);
  pot(canvas, RAMPS.potClay, 8, 11);
});

// ---- peças novas (do frame 12 em diante) ----

export const officeChairBack = draw((canvas) => {
  canvas.box(4, 2, 8, 9, RAMPS.charcoal);
  canvas.hline(5, 4, 6, 'shadow');
  canvas.box(3, 9, 10, 3, RAMPS.charcoal);
  canvas.outline('ink');
  canvas.vline(7, 12, 1, 'gray').vline(8, 12, 1, 'ink');
  canvas.hline(5, 13, 6, 'ink').px(4, 14, 'ink').px(11, 14, 'ink').px(7, 14, 'ink');
});

export const officeChairSide = draw((canvas) => {
  canvas.box(10, 2, 3, 9, RAMPS.charcoal);
  canvas.box(3, 8, 9, 3, RAMPS.charcoal);
  canvas.outline('ink');
  canvas.vline(7, 11, 2, 'gray');
  canvas.hline(4, 13, 7, 'ink').px(4, 14, 'ink').px(10, 14, 'ink');
});

export const kitchenChair = draw((canvas) => {
  const material = RAMPS.woodLight;
  canvas.box(4, 2, 8, 2, material).box(4, 5, 8, 2, material);
  canvas.vline(4, 2, 7, material.dark).vline(11, 2, 7, material.dark);
  canvas.box(3, 8, 10, 3, material);
  canvas.vline(4, 11, 4, 'peach').vline(11, 11, 4, 'peach');
  canvas.outline(material.outline);
});

function beanbag(ramp: Ramp): Pixels {
  return draw((canvas) => {
    const mask = any(circle(8, 10, 6), circle(8, 6.5, 4.2));
    canvas.blob(mask, ramp, { x: 6, y: 6, r: 7 });
    canvas.outline(ramp.outline);
  });
}
export const beanbagBlue = beanbag(BLUE);
export const beanbagPink = beanbag(PINK);
export const beanbagYellow = beanbag(YELLOW);

export const cactus = draw((canvas) => {
  const body = (x: number, y: number) =>
    (x >= 6 && x <= 9 && y >= 2 && y <= 11) || (x >= 3 && x <= 5 && y >= 5 && y <= 8) || (x === 3 && y >= 3 && y <= 5) ||
    (x >= 10 && x <= 12 && y >= 6 && y <= 8) || (x === 12 && y >= 4 && y <= 6);
  canvas.blob(body, CACTUS, { x: 6, y: 4, r: 6 });
  canvas.outline(CACTUS.outline);
  canvas.px(7, 4, 'sprout').px(8, 7, 'sprout').px(7, 1, 'pink');
  pot(canvas, RAMPS.potClay, 8, 11);
});

export const monstera = draw((canvas) => {
  const leaves = any(circle(5, 5, 4), circle(11, 5, 4), circle(8, 8, 4), circle(8, 2.5, 2.5));
  canvas.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 6, y: 3, r: 7 });
  canvas.outline(RAMPS.leaf.outline);
  // Recortes da folha de costela-de-adão.
  for (const [x, y] of [[4, 5], [5, 6], [11, 4], [10, 5], [8, 9], [7, 3]] as const) canvas.px(x, y, 'pine');
  pot(canvas, RAMPS.potWhite, 8, 11);
});

export const snakePlant = draw((canvas) => {
  const blades: [number, number][] = [[5, 4], [6, 1], [7, 3], [8, 0], [9, 2], [10, 5]];
  for (const [x, top] of blades) {
    for (let y = top; y < 12; y++) canvas.px(x, y, y % 3 === 0 ? 'sprout' : (x + y) % 2 === 0 ? 'green' : 'emerald');
  }
  canvas.outline('pine');
  pot(canvas, RAMPS.metal, 8, 11);
});

export const flowerPot = draw((canvas) => {
  const leaves = any(circle(8, 7, 4.5), circle(5, 9, 2.5), circle(11, 9, 2.5));
  canvas.blob((x, y) => y < 12 && leaves(x, y), RAMPS.leaf, { x: 7, y: 5, r: 6 });
  canvas.outline(RAMPS.leaf.outline);
  for (const [x, y, color] of [[6, 4, 'pink'], [9, 5, 'white'], [7, 7, 'hotpink'], [10, 8, 'pink'], [5, 8, 'white'], [8, 3, 'lemon']] as const) canvas.px(x, y, color);
  pot(canvas, RAMPS.potClay, 8, 11);
});

export const ficus = draw((canvas) => {
  canvas.blob(circle(8, 5, 5), RAMPS.leaf, { x: 6, y: 3, r: 6 });
  canvas.outline(RAMPS.leaf.outline);
  canvas.vline(7, 10, 2, 'bark').vline(8, 10, 2, 'rust');
  pot(canvas, RAMPS.potWhite, 8, 12);
});

export const succulent = draw((canvas) => {
  const rosette = any(circle(8, 10, 3.2), circle(6, 9, 1.6), circle(10, 9, 1.6), circle(8, 7.5, 1.6));
  canvas.blob(rosette, { outline: 'slate', dark: 'fern', base: 'sage', light: 'celery', shine: 'mist' }, { x: 7, y: 8, r: 3 });
  canvas.outline('slate');
  canvas.box(5, 12, 6, 3, RAMPS.potClay);
  canvas.outline('rust', (_x, y) => y >= 12);
});

export const floorLamp = draw((canvas) => {
  // Cúpula em trapézio, acesa por dentro (mais clara embaixo).
  canvas.hline(6, 1, 4, 'cream').hline(5, 2, 6, 'cream').hline(5, 3, 6, 'white').hline(4, 4, 8, 'lemon');
  canvas.outline('tan');
  canvas.vline(7, 5, 9, 'dusk').vline(8, 5, 9, 'gray');
  canvas.box(5, 14, 6, 1, RAMPS.charcoal);
  canvas.px(5, 14, 'ink').px(10, 14, 'ink');
});

export const trashBin = draw((canvas) => {
  canvas.box(4, 6, 8, 9, RAMPS.metal);
  canvas.hline(4, 6, 8, 'white').hline(5, 7, 6, 'dusk');
  canvas.vline(6, 9, 4, 'mist').vline(9, 9, 4, 'gray');
  canvas.outline('shadow');
  canvas.px(7, 5, 'white').px(8, 4, 'mist');
});

export const printer = draw((canvas) => {
  canvas.box(2, 4, 12, 6, RAMPS.white);
  canvas.rect(4, 3, 8, 2, 'white').rect(4, 5, 8, 1, 'gray');
  canvas.px(12, 6, 'leaf').px(11, 6, 'sky');
  canvas.box(3, 10, 10, 5, RAMPS.charcoal);
  canvas.hline(4, 12, 8, 'shadow');
  canvas.outline('dusk', (_x, y) => y < 10);
  canvas.outline('ink', (_x, y) => y >= 10);
});

export const coatRack = draw((canvas) => {
  canvas.vline(7, 2, 12, 'rust').vline(8, 2, 12, 'clay');
  canvas.px(5, 2, 'rust').px(10, 2, 'rust').px(6, 1, 'rust').px(9, 1, 'rust');
  canvas.box(3, 3, 4, 7, PINK);
  canvas.box(9, 3, 4, 5, BLUE);
  canvas.hline(5, 14, 6, 'bark');
  canvas.outline('ink', (x, y) => y >= 3 && y <= 10 && (x <= 6 || x >= 9));
});

export const fireExtinguisher = draw((canvas) => {
  canvas.box(5, 4, 6, 11, { outline: 'maroon', dark: 'crimson', base: 'red', light: 'salmon' });
  canvas.rect(6, 7, 4, 3, 'white').hline(6, 8, 4, 'red');
  canvas.outline('maroon');
  canvas.rect(6, 2, 3, 2, 'ink').px(9, 2, 'shadow').px(10, 3, 'shadow').px(11, 4, 'shadow').px(11, 5, 'shadow');
});

export const cardboardBox = draw((canvas) => {
  canvas.box(2, 5, 12, 10, RAMPS.potClay);
  canvas.hline(2, 8, 12, 'clay');
  canvas.vline(7, 5, 3, 'cream').vline(8, 5, 3, 'cream');
  canvas.outline('rust');
});

export const barStool = draw((canvas) => {
  canvas.box(4, 4, 8, 3, RAMPS.woodLight);
  canvas.outline('rust');
  canvas.vline(7, 7, 6, 'dusk').vline(8, 7, 6, 'gray');
  canvas.hline(5, 11, 6, 'gray');
  canvas.box(5, 13, 6, 2, RAMPS.charcoal);
  canvas.outline('ink', (_x, y) => y >= 13);
});

export const sideTable = draw((canvas) => {
  const top = (x: number, y: number) => ((x + 0.5 - 8) / 6) ** 2 + ((y + 0.5 - 7) / 3) ** 2 <= 1;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (top(x, y)) canvas.px(x, y, y < 6 ? 'cream' : 'honey');
  canvas.outline('rust');
  canvas.vline(7, 10, 4, 'tan').vline(8, 10, 4, 'rust');
  canvas.hline(5, 14, 6, 'rust');
  canvas.rect(9, 4, 3, 3, 'white').px(12, 5, 'white').px(10, 4, 'mist');
});

export { officeChair, pottedPlant };
export const officeChairRight = mirror(officeChairSide);
