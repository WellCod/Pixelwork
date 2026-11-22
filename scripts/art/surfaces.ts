// Pisos, tapetes e paredes no padrão novo (docs/art.md, guia de estilo): fundo claro e de baixo
// contraste, para os móveis e as pessoas se destacarem. Texturas por função de (x, y) -> cor.
import { PALETTE, type ColorName } from '../lib/colors.ts';
import type { Pixels } from '../lib/pixels.ts';

const T = 16;

/** Tile 16x16 de textura: cada pixel recebe a cor nomeada devolvida por `fn`. */
export function texture(fn: (x: number, y: number) => ColorName, w = T, h = T): Pixels {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => PALETTE[fn(x, y)]));
}

// ---- pisos ----

/**
 * Madeira clara: tábuas creme de 4 px, emendas desencontradas em mel e veio discreto. O topo de
 * cada tábua é um tom acima (luz de cima), a última linha é a emenda em pêssego; a ponta das tábuas,
 * em mel.
 */
export const woodLight = texture((x, y) => {
  const plank = Math.floor(y / 4);
  const row = y % 4;
  const joint = (plank * 5 + 3) % T;
  if (row === 3) return 'peach';
  if (x === joint) return 'tan';
  if (row === 0) return 'white';
  // Veio discreto: um pixel de pêssego espaçado em cada tábua.
  if (row === 1 && (x * 3 + plank * 7) % 11 === 0) return 'peach';
  return 'cream';
});

/** Ladrilho creme em junta amarrada (8x4) com rejunte branco. */
export const creamTile = texture((x, y) => {
  const course = Math.floor(y / 4);
  const offset = course % 2 === 0 ? 0 : 4;
  const bx = (x + offset) % 8;
  const by = y % 4;
  // Rejunte branco sobre peças creme lisas, como piso de tijolinho claro.
  if (by === 3 || bx === 7) return 'white';
  return 'cream';
});

/** Carpete cinza de escritório: espinha de peixe miúda em dois cinzas. */
export const grayCarpet = texture((x, y) => {
  // Espinha de peixe discreta: só um pixel claro a cada dois na diagonal, sobre cinza liso.
  const band = Math.floor(y / 4) % 2;
  const diagonal = band === 0 ? (x + y) % 4 : (x - y + 16) % 4;
  if (diagonal === 0 && x % 2 === 0) return 'mist';
  return 'gray';
});

// ---- tapetes (9 tiles: NO, N, NE, O, centro, L, SO, S, SE) ----

interface RugColors {
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
    const mx = x % 8;
    const my = y % 8;
    if (fromEdge > 3 && Math.abs(mx - 4) + Math.abs(my - 4) === 2) return colors.motif;
    return colors.field;
  });
}

export function rug(colors: RugColors): Pixels[] {
  const tiles: Pixels[] = [];
  for (const [north, south] of [[true, false], [false, false], [false, true]] as const) {
    for (const [west, east] of [[true, false], [false, false], [false, true]] as const) {
      tiles.push(rugTile(colors, north, south, west, east));
    }
  }
  return tiles;
}

export const RUG_LAVENDER: RugColors = { edge: 'violet', stripe: 'lilac', field: 'lavender', motif: 'lilac' };

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
