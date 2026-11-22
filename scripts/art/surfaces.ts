// Pisos, tapetes e paredes no padrão novo (docs/art.md, guia de estilo): fundo claro e de baixo
// contraste, para os móveis e as pessoas se destacarem. Texturas por função de (x, y) -> cor.
import { PALETTE, type ColorName } from '../lib/colors.ts';
import { Canvas } from '../lib/draw.ts';
import type { Pixels } from '../lib/pixels.ts';

const T = 16;

/** Tile 16x16 de textura: cada pixel recebe a cor nomeada devolvida por `fn`. */
export function texture(fn: (x: number, y: number) => ColorName, w = T, h = T): Pixels {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => PALETTE[fn(x, y)]));
}

// ---- pisos ----

/**
 * Madeira clara: tábuas creme de 8 px, emenda de 1 px em pêssego e ponta das tábuas desencontrada.
 * Pouco contraste de propósito (guia de estilo): o piso é fundo, os móveis e as pessoas é que
 * aparecem. Tábua de 4 px com friso branco virava listra e lia como tijolo.
 */
/**
 * Madeira clara: tábuas de carvalho de 8 px, topo um tom acima (luz de cima), emenda e ponta das
 * tábuas em carvalho escuro, desencontradas, e dois pixels de veio por tábua. Pouco contraste de
 * propósito: o piso é fundo. (Tábua de 4 px com friso branco sobre pêssego lia como tijolo.)
 */
export const woodLight = texture((x, y) => {
  const plank = Math.floor(y / 8);
  const row = y % 8;
  if (row === 7) return 'oakSeam';
  if (x === (plank * 9 + 4) % T) return 'oakSeam';
  if (row === 0) return 'oakLight';
  if ((row === 3 && x === (plank * 5 + 11) % T) || (row === 5 && x === (plank * 7 + 1) % T)) return 'oakSeam';
  return 'oak';
});

/** Ladrilho claro grande (8x8) com rejunte carvalho fino: liso, sem cara de tijolo. */
export const creamTile = texture((x, y) => (x % 8 === 7 || y % 8 === 7 ? 'oak' : 'oakLight'));

/** Carpete lavanda claro: liso, com pontos rosados espaçados. */
export const lilacCarpet = texture((x, y) => ((x * 3 + y * 5) % 17 === 0 ? 'pink' : 'lilac'));

/** Carpete azul-claro: liso, com pontos brancos espaçados. */
export const iceCarpet = texture((x, y) => ((x * 5 + y * 3) % 17 === 0 ? 'white' : 'ice'));

/** Ladrilho de copa: peças brancas de 8 px com rejunte névoa (o xadrez chamava atenção demais). */
export const kitchenChecker = texture((x, y) => (x % 8 === 7 || y % 8 === 7 ? 'mist' : 'white'));

/** Taco em espinha de peixe: peças 2x6 em diagonal, creme, só a emenda em pêssego. */
/** Taco em espinha de peixe: peças em diagonal de carvalho, emenda escura e filete claro ao lado. */
export const herringbone = texture((x, y) => {
  // Colunas de 4 px alternando a direção da diagonal: o zigue-zague da espinha de peixe.
  const forward = Math.floor(x / 4) % 2 === 0;
  const k = ((forward ? x : -x + 16) + 2 * y) % 8;
  if (k === 0) return 'oakSeam';
  if (k === 1) return 'oakLight';
  return 'oak';
});

/** Madeira escura: tábuas de 8 px em ferrugem, emenda em casca, veio em barro. */
export const woodDark = texture((x, y) => {
  const plank = Math.floor(y / 8);
  const row = y % 8;
  if (row === 7 || x === (plank * 9 + 4) % T) return 'bark';
  if ((row === 2 && x === (plank * 5 + 11) % T) || (row === 5 && x === (plank * 7 + 1) % T)) return 'clay';
  return 'rust';
});

/** Grama para a área externa: verde-folha com tufos claros espaçados. */
export const grass = texture((x, y) => {
  const h = (x * 7 + y * 13) % 23;
  if (h === 0) return 'sprout';
  if (h === 11) return 'sage';
  return 'leaf';
});

/** Calçada de pedras irregulares: pedras névoa com junta cinza. */
export const stonePath = texture((x, y) => {
  const row = Math.floor(y / 5);
  const offset = (row * 3) % 6;
  if (y % 5 === 4 || (x + offset) % 6 === 5) return 'gray';
  if ((x + offset) % 6 === 0 && y % 5 === 0) return 'white';
  return 'mist';
});

/** Cimento queimado: névoa lisa com raros pontos cinza. */
export const concrete = texture((x, y) => ((x * 11 + y * 7) % 23 === 0 ? 'gray' : 'mist'));

/** Ladrilho sálvia claro 8x8 com rejunte sálvia (tom vizinho, nada de grade branca). */
export const sageTile = texture((x, y) => (x % 8 === 7 || y % 8 === 7 ? 'sage' : 'celery'));

/**
 * Carpete de escritório claro: névoa com uma trama miúda em branco, espaçada. Fica na família das
 * paredes e não esfria a sala como o cinza-azulado.
 */
export const grayCarpet = texture((x, y) => ((x + 2 * y) % 8 === 0 && y % 2 === 0 ? 'white' : 'mist'));

// ---- tapetes (16 tiles, um por combinação de bordas: máscara N=1, S=2, O=4, L=8) ----

export interface RugColors {
  edge: ColorName;
  stripe: ColorName;
  field: ColorName;
  motif: ColorName;
}

/**
 * Um tile do tapete. A borda tem 3 px (contorno, filete claro, campo) só nos lados de fora, então
 * qualquer retângulo de tiles fecha certinho; o miolo tem um losango a cada 8 px.
 */
function rugTile(colors: RugColors, north: boolean, south: boolean, west: boolean, east: boolean): Pixels {
  return texture((x, y) => {
    const fromEdge = Math.min(north ? y : 99, south ? T - 1 - y : 99, west ? x : 99, east ? T - 1 - x : 99);
    if (fromEdge === 0) return colors.edge;
    if (fromEdge === 2) return colors.stripe;
    // Losango só quando a célula de 8 px inteira está longe da borda: nada de losango cortado.
    const cx = Math.floor(x / 8) * 8 + 4;
    const cy = Math.floor(y / 8) * 8 + 4;
    const cellFromEdge = Math.min(north ? cy : 99, south ? T - 1 - cy : 99, west ? cx : 99, east ? T - 1 - cx : 99);
    if (cellFromEdge >= 6 && Math.abs(x - cx) + Math.abs(y - cy) === 2) return colors.motif;
    return colors.field;
  });
}

/** 16 tiles por tapete, na ordem da máscara de bordas (N=1, S=2, O=4, L=8), como `paintRug` espera. */
export function rug(colors: RugColors): Pixels[] {
  return Array.from({ length: 16 }, (_, mask) =>
    rugTile(colors, (mask & 1) !== 0, (mask & 2) !== 0, (mask & 4) !== 0, (mask & 8) !== 0),
  );
}

export const RUG_LAVENDER: RugColors = { edge: 'mauve', stripe: 'white', field: 'lilac', motif: 'pink' };
export const RUG_SAGE: RugColors = { edge: 'fern', stripe: 'celery', field: 'sage', motif: 'mist' };
export const RUG_CREAM: RugColors = { edge: 'clay', stripe: 'cream', field: 'peach', motif: 'cream' };

// ---- paredes ----

/** Topo da parede visto de cima: claro, com a aresta de baixo um tom abaixo. */
export const wallTop = texture((_x, y) => {
  if (y === T - 1) return 'gray';
  return 'mist';
});

/** Face da parede: friso branco no alto, painéis claros com junta vertical e rodapé escuro. */
export const wallFace = texture((x, y) => {
  if (y === 0) return 'gray';
  if (y === 1 || y === 2) return 'white';
  if (y === 3) return 'gray';
  if (y >= 13) return y === 13 ? 'gray' : 'dusk';
  if (x % 8 === 0) return 'gray';
  if (x % 8 === 1) return 'white';
  return 'mist';
});

/** Janela na face da parede: caixilho branco, vidro azul-claro com reflexo em diagonal e peitoril. */
export const wallWindow = texture((x, y) => {
  const face = wallFace.at(y)?.at(x);
  const frame = x === 2 || x === 13 || y === 3 || y === 11 || x === 7 || x === 8;
  const inside = x > 2 && x < 13 && y > 3 && y < 11;
  if (y === 12 && x >= 1 && x <= 14) return 'white';
  if (y === 11 && x >= 1 && x <= 14) return 'gray';
  if (x >= 2 && x <= 13 && y >= 3 && y <= 11 && frame) return y === 3 ? 'white' : 'mist';
  if (inside) {
    if ((x - y + 16) % 6 === 0 || (x - y + 16) % 6 === 1) return 'white';
    return y >= 8 ? 'sky' : 'ice';
  }
  return (Object.entries(PALETTE).find(([, hex]) => hex === face)?.[0] ?? 'mist') as ColorName;
});

// ---- decoração de parede (sobre a face da parede) ----

/** Face da parede com outra cor de painel (pintura). */
function paintedFace(panel: ColorName, joint: ColorName, trim: ColorName = 'white'): Pixels {
  return texture((x, y) => {
    if (y === 0) return 'gray';
    if (y === 1 || y === 2) return trim;
    if (y === 3) return joint;
    if (y >= 13) return y === 13 ? joint : 'dusk';
    if (x % 8 === 0) return joint;
    return panel;
  });
}

export const wallFaceSage = paintedFace('celery', 'sage');
export const wallFaceCream = paintedFace('cream', 'peach');
export const wallFaceLilac = paintedFace('lilac', 'pink');

/** Desenha `draw` por cima da face clara da parede. */
function onWall(draw: (c: Canvas) => void): Pixels {
  const c = new Canvas(T, T);
  draw(c);
  const top = c.toPixels();
  return wallFace.map((row, y) => row.map((hex, x) => (top[y]?.[x] !== '.' ? (top[y]?.[x] ?? hex) : hex)));
}

/** Quadro abstrato: moldura clara e formas em pêssego, céu e mel. */
export const wallPainting = onWall((c) => {
  c.rect(3, 3, 10, 9, 'white').rect(4, 4, 8, 7, 'cream');
  c.rect(4, 7, 8, 4, 'peach').rect(8, 4, 4, 4, 'sky');
  c.rect(5, 5, 2, 2, 'honey').px(9, 8, 'coral').px(10, 9, 'coral');
  c.outline('rosewood');
});

/** Pôster com sol sobre céu, borda branca. */
export const wallPoster = onWall((c) => {
  c.rect(4, 3, 8, 10, 'white').rect(5, 4, 6, 8, 'ice');
  c.rect(5, 9, 6, 3, 'sky').rect(7, 5, 2, 2, 'gold').px(6, 6, 'honey').px(9, 6, 'honey');
  c.outline('blue');
});

/** Relógio redondo de parede. */
export const wallClock = onWall((c) => {
  const inside = (x: number, y: number) => Math.hypot(x - 7.5, y - 7.5) <= 4.6;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if (inside(x, y)) c.px(x, y, 'white');
  c.outline('dusk');
  c.px(7, 5, 'ink').px(7, 6, 'ink').px(7, 7, 'ink').px(8, 7, 'red').px(9, 7, 'red');
  c.px(7, 4, 'gray').px(4, 7, 'gray').px(11, 7, 'gray').px(7, 11, 'gray');
});

/** Lousa branca com rabiscos de caneta. */
export const wallWhiteboard = onWall((c) => {
  c.rect(1, 3, 14, 9, 'white');
  c.hline(3, 5, 6, 'sky').hline(3, 7, 9, 'blue').hline(3, 9, 4, 'red').px(10, 9, 'emerald').px(11, 8, 'emerald');
  c.outline('gray');
  c.hline(2, 12, 12, 'gray').px(4, 12, 'red').px(6, 12, 'blue');
});

/** Prateleira de parede com livros coloridos e um vasinho. */
export const wallShelf = onWall((c) => {
  const books: [number, ColorName, number][] = [
    [2, 'blue', 6],
    [3, 'coral', 5],
    [4, 'emerald', 6],
    [5, 'honey', 4],
    [7, 'violet', 6],
    [8, 'rose', 5],
  ];
  for (const [x, color, h] of books) c.rect(x, 11 - h, 1, h, color);
  c.rect(10, 8, 3, 3, 'white').px(11, 7, 'leaf').px(10, 6, 'emerald').px(12, 6, 'leaf');
  c.outline('ink');
  c.hline(1, 11, 14, 'tan').hline(1, 12, 14, 'rust');
});

/** Mural de cortiça com bilhetes. */
export const wallCorkboard = onWall((c) => {
  c.rect(2, 3, 12, 9, 'tan');
  c.rect(3, 4, 3, 3, 'lemon').rect(7, 5, 3, 3, 'pink').rect(10, 4, 3, 3, 'ice').rect(4, 8, 4, 3, 'white');
  c.px(4, 4, 'red').px(8, 5, 'blue').px(11, 4, 'red');
  c.outline('rust');
});

/** Planta pendurada num suporte, com ramos caindo. */
export const wallHangingPlant = onWall((c) => {
  c.rect(5, 6, 6, 3, 'white');
  c.outline('dusk');
  const leaves: [number, number][] = [[4, 5], [5, 4], [7, 4], [9, 4], [10, 5], [11, 6], [4, 9], [4, 10], [5, 11], [10, 9], [11, 10], [11, 11], [7, 9]];
  for (const [x, y] of leaves) c.px(x, y, (x + y) % 2 === 0 ? 'leaf' : 'emerald');
  c.px(8, 2, 'gray').px(8, 3, 'gray');
});

/** TV de parede: moldura escura e reflexo. */
export const wallTv = onWall((c) => {
  c.rect(2, 4, 12, 8, 'navy');
  c.px(3, 5, 'indigo').px(4, 5, 'indigo').px(3, 6, 'indigo').hline(5, 10, 6, 'indigo');
  c.outline('ink');
});

/** Janela dupla com cortina sálvia nas laterais. */
export const wallWindowCurtain = onWall((c) => {
  c.rect(3, 3, 10, 9, 'ice');
  for (let y = 4; y < 11; y++) c.px(3 + ((y + 2) % 6), y, 'white');
  c.rect(3, 8, 10, 3, 'sky').vline(8, 3, 9, 'mist');
  c.outline('white');
  c.rect(1, 2, 2, 11, 'sage').rect(13, 2, 2, 11, 'sage').vline(2, 2, 11, 'fern').vline(14, 2, 11, 'fern');
});
