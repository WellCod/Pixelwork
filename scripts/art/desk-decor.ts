// Mesa de trabalho e decoração (tileset `desk-decor`, célula 16x16). Os itens ficam embaixo e no
// centro da célula: o cliente desenha cada um ancorado no canto inferior esquerdo, deslocado para
// o lugar da mesa (SLOT_OFFSET). A mesa larga é desenhada inteira e cortada em metades.
import type { ColorName } from '../lib/colors.ts';
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import type { Pixels } from '../lib/pixels.ts';

const TILE = 16;
/** Desenha um item 16x16 numa tela nova e devolve os pixels. */
const item = (paint: (canvas: Canvas) => void): Pixels => {
  const canvas = new Canvas(TILE, TILE);
  paint(canvas);
  return canvas.toPixels();
};

const WHITE_TOP: Ramp = { outline: 'dusk', dark: 'mist', base: 'white', light: 'white' };

interface DeskStyle {
  top: Ramp;
  apron: ColorName;
  legs: ColorName;
  outline: ColorName;
}

export const DESK_STYLES = {
  basic: { top: RAMPS.woodLight, apron: 'peach', legs: 'clay', outline: 'clay' },
  dark: { top: RAMPS.woodDark, apron: 'bark', legs: 'ink', outline: 'ink' },
  white: { top: WHITE_TOP, apron: 'mist', legs: 'gray', outline: 'dusk' },
} as const satisfies Record<string, DeskStyle>;

/** Mesa larga (32x16) com gaveteiro à direita, ou lateral (16x32) com gaveteiro embaixo. */
function wideDesk(style: DeskStyle, vertical: boolean): Pixels {
  const deskWidth = vertical ? 16 : 32;
  const deskHeight = vertical ? 32 : 16;
  const canvas = new Canvas(deskWidth, deskHeight);
  if (vertical) {
    canvas.box(1, 2, 14, 24, style.top);
    canvas.rect(1, 25, 14, 2, style.apron);
    canvas.rect(2, 27, 1, 4, style.legs).rect(13, 27, 1, 4, style.legs);
    canvas.box(4, 27, 8, 4, style.top).hline(5, 29, 6, style.apron);
  } else {
    canvas.box(1, 3, 30, 8, style.top);
    canvas.rect(1, 10, 30, 2, style.apron);
    canvas.rect(2, 12, 1, 3, style.legs);
    canvas.box(21, 12, 9, 3, style.top).hline(22, 13, 7, style.apron).px(25, 12, style.legs);
  }
  canvas.outline(style.outline);
  return canvas.toPixels();
}

/** Corta um desenho em células de 16x16, da esquerda para a direita e de cima para baixo. */
function cells(pixels: Pixels): Pixels[] {
  const tiles: Pixels[] = [];
  for (let y = 0; y < pixels.length; y += TILE) {
    for (let x = 0; x < (pixels[0]?.length ?? 0); x += TILE) tiles.push(pixels.slice(y, y + TILE).map((row) => row.slice(x, x + TILE)));
  }
  return tiles;
}

/** Metades da mesa larga: [esquerda, direita] e da lateral: [cima, baixo]. */
export function deskHalves(style: DeskStyle): { wide: Pixels[]; tall: Pixels[] } {
  return { wide: cells(wideDesk(style, false)), tall: cells(wideDesk(style, true)) };
}

/** Mesa de 1 tile na variante branca (as outras vêm de furniture-small). */
export const whiteDesk = item((canvas) => {
  canvas.box(1, 3, 14, 8, WHITE_TOP);
  canvas.rect(1, 10, 14, 2, 'mist');
  canvas.rect(2, 12, 1, 3, 'gray').rect(13, 12, 1, 3, 'gray');
  canvas.outline('dusk');
});

// ---- monitores ----

/** Tela de monitor: moldura escura, vidro azul com faixa de brilho no alto e um reflexo. */
function screen(canvas: Canvas, x: number, y: number, screenWidth: number, screenHeight: number): void {
  canvas.rect(x, y, screenWidth, screenHeight, 'navy');
  canvas.rect(x + 1, y + 1, screenWidth - 2, screenHeight - 2, 'sky');
  canvas.hline(x + 1, y + 1, screenWidth - 2, 'ice');
  canvas.px(x + 2, y + 3, 'white').px(x + 3, y + 3, 'ice');
}

export const monitorSingle = item((canvas) => {
  screen(canvas, 3, 3, 10, 7);
  canvas.rect(7, 10, 2, 2, 'dusk').hline(5, 12, 6, 'dusk');
  canvas.outline('ink', (_x, y) => y < 10);
});

export const monitorDual = item((canvas) => {
  screen(canvas, 0, 4, 8, 6);
  screen(canvas, 8, 4, 8, 6);
  canvas.rect(7, 10, 2, 2, 'dusk').hline(4, 12, 8, 'dusk');
  canvas.outline('ink', (_x, y) => y < 10);
});

export const laptop = item((canvas) => {
  canvas.rect(4, 5, 8, 5, 'gray').rect(5, 6, 6, 3, 'sky').hline(5, 6, 6, 'ice');
  canvas.rect(3, 10, 10, 2, 'mist').hline(4, 10, 8, 'gray');
  canvas.outline('dusk');
});

// ---- itens sobre a mesa ----

export const mug = item((canvas) => {
  canvas.box(6, 9, 4, 4, RAMPS.white);
  canvas.hline(7, 9, 2, 'rust');
  canvas.outline('dusk');
  canvas.px(10, 10, 'dusk').px(11, 11, 'dusk').px(10, 12, 'dusk');
});

export const lamp = item((canvas) => {
  canvas.hline(5, 13, 5, 'shadow');
  canvas.vline(7, 8, 5, 'dusk').px(8, 7, 'dusk').px(9, 6, 'dusk');
  canvas.hline(8, 4, 5, 'gold').hline(9, 5, 4, 'gold').px(10, 6, 'lemon').px(11, 6, 'lemon');
  canvas.outline('rust', (_x, y) => y <= 6);
});

export const books = item((canvas) => {
  canvas.rect(4, 11, 8, 2, 'blue').hline(5, 11, 6, 'sky');
  canvas.rect(5, 9, 7, 2, 'coral').hline(6, 9, 5, 'peach');
  canvas.rect(4, 7, 6, 2, 'emerald').hline(5, 7, 4, 'leaf');
  canvas.outline('ink');
});

export const pencilCup = item((canvas) => {
  canvas.box(6, 9, 4, 4, { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' });
  canvas.outline('navy');
  canvas.vline(6, 6, 3, 'gold').vline(8, 5, 4, 'red').vline(9, 7, 2, 'emerald');
  canvas.px(6, 5, 'cream').px(8, 4, 'ink');
});

export const headphones = item((canvas) => {
  canvas.hline(6, 7, 4, 'shadow').px(5, 8, 'shadow').px(10, 8, 'shadow');
  canvas.rect(4, 9, 2, 3, 'hotpink').rect(10, 9, 2, 3, 'hotpink');
  canvas.outline('ink', (_x, y) => y >= 9);
});

export const miniCactus = item((canvas) => {
  canvas.rect(7, 6, 2, 5, 'emerald').px(6, 8, 'emerald').px(9, 7, 'emerald').px(7, 7, 'leaf');
  canvas.outline('pine');
  canvas.px(8, 5, 'pink');
  canvas.box(6, 11, 4, 2, RAMPS.potClay);
  canvas.outline('rust', (_x, y) => y >= 11);
});

export const photoFrame = item((canvas) => {
  canvas.rect(5, 6, 6, 7, 'honey').rect(6, 7, 4, 4, 'ice').rect(6, 9, 4, 2, 'leaf').px(8, 8, 'cream');
  canvas.outline('rust');
});

export const waterBottle = item((canvas) => {
  canvas.rect(7, 5, 2, 1, 'navy');
  canvas.rect(6, 6, 4, 7, 'ice').vline(6, 7, 5, 'white').rect(6, 9, 4, 2, 'sky');
  canvas.outline('blue');
});

export const stickyNotes = item((canvas) => {
  canvas.rect(4, 10, 4, 3, 'lemon').rect(8, 9, 4, 3, 'pink').rect(6, 11, 4, 2, 'ice');
  canvas.hline(5, 11, 2, 'amber').hline(9, 10, 2, 'rose');
});

export const deskSpeaker = item((canvas) => {
  canvas.box(6, 6, 4, 7, RAMPS.charcoal);
  canvas.outline('ink');
  canvas.px(7, 8, 'gray').px(8, 8, 'gray').px(7, 11, 'mauve').px(8, 11, 'mauve');
});

export const takeawayCoffee = item((canvas) => {
  canvas.rect(6, 6, 4, 1, 'white');
  canvas.rect(6, 7, 4, 6, 'cream').rect(6, 9, 4, 2, 'tan');
  canvas.outline('rust');
});

export const trophy = item((canvas) => {
  canvas.rect(5, 5, 6, 3, 'gold').rect(6, 8, 4, 1, 'gold').vline(7, 9, 2, 'amber').vline(8, 9, 2, 'amber');
  canvas.px(4, 6, 'gold').px(11, 6, 'gold').hline(6, 11, 4, 'rust').hline(5, 12, 6, 'bark');
  canvas.outline('rust', (_x, y) => y < 11);
  canvas.px(6, 5, 'lemon');
});

export const rubberDuck = item((canvas) => {
  canvas.rect(5, 9, 6, 4, 'gold').rect(8, 6, 3, 3, 'gold').px(11, 7, 'orange').px(10, 7, 'ink');
  canvas.px(6, 9, 'lemon').px(9, 6, 'lemon');
  canvas.outline('amber');
});

// ---- itens de parede (atrás da mesa) ----

export const poster = item((canvas) => {
  canvas.rect(4, 3, 8, 10, 'white').rect(5, 4, 6, 8, 'lilac');
  canvas.rect(6, 5, 4, 4, 'lavender').px(7, 6, 'gold').hline(5, 10, 6, 'purple');
  canvas.outline('violet');
});

export const clock = item((canvas) => {
  const face = (x: number, y: number) => Math.hypot(x + 0.5 - 8, y + 0.5 - 8) <= 4;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (face(x, y)) canvas.px(x, y, 'white');
  canvas.outline('dusk');
  canvas.px(8, 6, 'ink').px(8, 7, 'ink').px(9, 8, 'red');
});

export const calendar = item((canvas) => {
  canvas.rect(4, 4, 8, 9, 'white').hline(4, 4, 8, 'red').hline(4, 5, 8, 'red');
  for (let y = 7; y < 12; y += 2) for (let x = 5; x < 11; x += 2) canvas.px(x, y, 'gray');
  canvas.px(7, 9, 'red');
  canvas.outline('dusk');
});

export const wallShelfMini = item((canvas) => {
  canvas.hline(2, 11, 12, 'tan').hline(2, 12, 12, 'rust');
  canvas.rect(3, 7, 2, 4, 'blue').rect(5, 8, 2, 3, 'coral');
  canvas.rect(9, 8, 3, 3, 'white').px(10, 6, 'leaf').px(9, 7, 'emerald').px(11, 7, 'emerald');
  canvas.outline('ink', (_x, y) => y < 11);
});

export const framedPhoto = item((canvas) => {
  canvas.rect(3, 4, 10, 8, 'shadow').rect(4, 5, 8, 6, 'ice').rect(4, 8, 8, 3, 'sage').px(9, 6, 'gold');
  canvas.outline('ink');
});

// ---- itens de chão (ao lado da mesa) ----

export const plantSmall = item((canvas) => {
  const leaves = (x: number, y: number) => Math.hypot(x + 0.5 - 8, y + 0.5 - 6.5) <= 3.6;
  canvas.blob(leaves, RAMPS.leaf, { x: 7, y: 5, r: 4 });
  canvas.outline(RAMPS.leaf.outline);
  canvas.box(6, 10, 4, 4, RAMPS.potWhite);
  canvas.outline(RAMPS.potWhite.outline, (_x, y) => y >= 10);
});

export const bin = item((canvas) => {
  canvas.box(5, 8, 6, 6, RAMPS.metal);
  canvas.hline(5, 8, 6, 'white').vline(7, 10, 3, 'mist');
  canvas.outline('shadow');
  canvas.px(7, 7, 'white').px(8, 6, 'cream');
});

export const backpack = item((canvas) => {
  canvas.box(5, 6, 6, 8, { outline: 'deepteal', dark: 'teal', base: 'aqua', light: 'mint' });
  canvas.rect(6, 10, 4, 3, 'teal').px(7, 11, 'gold');
  canvas.outline('deepteal');
  canvas.px(7, 5, 'deepteal').px(8, 5, 'deepteal');
});

export const vaseTall = item((canvas) => {
  canvas.box(6, 6, 4, 8, { outline: 'navy', dark: 'blue', base: 'sky', light: 'ice' });
  canvas.outline('navy');
  canvas.px(7, 4, 'pink').px(8, 3, 'hotpink').px(9, 5, 'pink').vline(8, 4, 2, 'green');
});

export const sleepingCat = item((canvas) => {
  const body = (x: number, y: number) => ((x + 0.5 - 8) / 5) ** 2 + ((y + 0.5 - 11) / 2.6) ** 2 <= 1;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (body(x, y)) canvas.px(x, y, y < 10 ? 'honey' : 'tan');
  canvas.px(4, 9, 'tan').px(5, 8, 'honey').px(3, 8, 'honey').px(6, 10, 'amber').px(9, 10, 'amber');
  canvas.outline('rust');
  canvas.px(4, 10, 'ink').px(11, 12, 'honey').px(12, 12, 'honey');
});

// ---- divisória (atrás da mesa sem parede; a decoração "de parede" fica presa nela) ----

const PANEL: Ramp = { outline: 'slate', dark: 'sage', base: 'celery', light: 'mist' };

/** Painel de tecido com moldura clara, de `panelWidth` px, com a base na última linha da célula. */
function divider(panelWidth: number): Pixels {
  const canvas = new Canvas(panelWidth, TILE);
  canvas.box(1, 2, panelWidth - 2, 14, PANEL);
  canvas.hline(1, 2, panelWidth - 2, 'white').vline(1, 3, 13, 'white');
  canvas.outline('slate');
  return canvas.toPixels();
}

/** Divisória de 1 tile, metades da larga e a lateral (painel estreito, espelhado pelo cliente). */
export const dividerSingle = divider(TILE);
export const dividerWide = cells(divider(32));
export const dividerSide = item((canvas) => {
  canvas.box(11, 0, 4, 16, PANEL);
  canvas.vline(11, 0, 16, 'white');
  canvas.outline('slate');
});

// ---- complementos de personalização ----

export const mechanicalKeyboard = item((canvas) => {
  canvas.rect(2, 9, 12, 5, 'navy').rect(3, 9, 10, 3, 'blue').hline(4, 12, 8, 'indigo');
  for (let x = 3; x <= 12; x += 2) canvas.px(x, 10, 'ice').px(x, 11, 'lilac');
  canvas.hline(5, 12, 5, 'lavender').px(12, 10, 'peach');
});

export const terrarium = item((canvas) => {
  canvas.rect(4, 6, 8, 7, 'deepteal').rect(5, 5, 6, 7, 'sage').rect(5, 7, 6, 4, 'mint');
  canvas.hline(5, 5, 6, 'seafoam').vline(5, 6, 4, 'ice').hline(5, 11, 6, 'bark');
  canvas.vline(8, 8, 3, 'pine').px(7, 9, 'leaf').px(9, 8, 'emerald');
});

export const drawingTablet = item((canvas) => {
  canvas.rect(3, 7, 10, 7, 'navy').rect(4, 8, 8, 5, 'indigo');
  canvas.rect(5, 9, 6, 3, 'lavender').hline(5, 9, 4, 'lilac').px(8, 10, 'peach').px(9, 11, 'pink');
  canvas.px(12, 6, 'ink').px(11, 7, 'ink').px(10, 8, 'white').px(8, 13, 'ice');
});

export const teaSet = item((canvas) => {
  canvas.hline(2, 13, 12, 'rosewood').hline(3, 12, 10, 'cream');
  canvas.rect(4, 7, 6, 5, 'purple').rect(5, 8, 4, 3, 'lilac').hline(5, 6, 4, 'violet');
  canvas.px(7, 5, 'lavender').px(3, 8, 'violet').px(2, 7, 'purple').px(10, 8, 'violet');
  canvas.rect(11, 10, 3, 2, 'lavender').px(11, 10, 'white');
});

export const handheld = item((canvas) => {
  canvas.rect(3, 8, 10, 5, 'indigo').rect(4, 7, 8, 7, 'blue');
  canvas.rect(6, 8, 4, 4, 'navy').rect(7, 9, 2, 2, 'mint');
  canvas.px(4, 10, 'ice').px(5, 11, 'ice').px(11, 9, 'peach').px(11, 11, 'pink');
});

export const wallVinyl = item((canvas) => {
  canvas.rect(5, 3, 6, 10, 'ink').rect(3, 5, 10, 6, 'ink').rect(4, 4, 8, 8, 'shadow');
  canvas.hline(6, 5, 4, 'mauve').px(5, 6, 'mauve').px(10, 10, 'dusk');
  canvas.rect(7, 7, 3, 3, 'rose').px(8, 8, 'cream');
});

export const moonPrint = item((canvas) => {
  canvas.rect(3, 3, 10, 10, 'violet').rect(4, 4, 8, 8, 'lilac').rect(5, 5, 6, 6, 'navy');
  canvas.px(8, 6, 'lemon').hline(7, 7, 2, 'cream').hline(7, 8, 2, 'cream');
  canvas.hline(8, 9, 2, 'lemon').px(10, 6, 'ice').px(6, 9, 'sky');
});

export const wallPennant = item((canvas) => {
  canvas.hline(3, 4, 10, 'rosewood').rect(4, 5, 8, 5, 'deepteal').rect(5, 5, 6, 5, 'teal');
  canvas.hline(5, 10, 6, 'deepteal').hline(6, 11, 4, 'teal').hline(7, 12, 2, 'deepteal');
  canvas.px(7, 6, 'seafoam').hline(6, 7, 3, 'mint').px(7, 8, 'seafoam');
});

export const wovenBasket = item((canvas) => {
  canvas.rect(4, 8, 9, 6, 'bark').rect(5, 9, 7, 4, 'honey').hline(4, 8, 9, 'tan');
  canvas.hline(6, 7, 5, 'bark').px(6, 6, 'tan').px(10, 6, 'tan').hline(7, 5, 3, 'tan');
  for (let x = 5; x <= 11; x += 2) canvas.px(x, 10, 'rust').px(x + 1, 12, 'clay');
});

export const floorCorgi = item((canvas) => {
  canvas.rect(6, 8, 7, 5, 'honey').hline(7, 12, 5, 'cream').hline(6, 13, 6, 'rust');
  canvas.rect(3, 7, 5, 5, 'tan').rect(4, 8, 3, 4, 'cream').px(3, 6, 'rust').px(7, 5, 'rust');
  canvas.px(4, 6, 'honey').px(7, 6, 'honey').px(4, 8, 'ink').px(3, 10, 'ink');
  canvas.px(13, 7, 'tan').px(12, 8, 'honey').px(12, 12, 'clay');
});
