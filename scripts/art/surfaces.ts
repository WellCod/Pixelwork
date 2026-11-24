// Pisos, tapetes e paredes no padrão novo (docs/art.md, guia de estilo): fundo claro e de baixo
// contraste, para os móveis e as pessoas se destacarem. Texturas por função de (x, y) -> cor.
import { PALETTE, type ColorName } from '../lib/colors.ts';
import { Canvas } from '../lib/draw.ts';
import type { Pixels } from '../lib/pixels.ts';

const TILE = 16;

/** Textura (16x16 por padrão): cada pixel recebe a cor nomeada devolvida por `colorAt`. */
export function texture(colorAt: (x: number, y: number) => ColorName, textureWidth = TILE, textureHeight = TILE): Pixels {
  return Array.from({ length: textureHeight }, (_, y) =>
    Array.from({ length: textureWidth }, (_, x) => PALETTE[colorAt(x, y)]),
  );
}

// ---- pisos ----

/** Carvalho claro com juntas finas e espaçadas, para continuar legível sem competir com os móveis. */
export const woodLight = texture((x, y) => {
  const plank = Math.floor(y / 8);
  if (y % 8 === 7 || x === (plank * 9 + 4) % TILE) return 'oak';
  if (y === 4 && x >= 10 && x <= 11) return 'oak';
  return 'oakLight';
});

/** Ladrilho creme de uma célula com rejunte de carvalho claro. */
export const creamTile = texture((x, y) => (x === TILE - 1 || y === TILE - 1 ? 'oak' : 'oakLight'));

/** Carpete lavanda claro: liso, com pontos rosados espaçados. */
export const lilacCarpet = texture((x, y) => ((x * 3 + y * 5) % 17 === 0 ? 'pink' : 'lilac'));

/** Carpete azul-claro: liso, com pontos brancos espaçados. */
export const iceCarpet = texture((x, y) => ((x * 5 + y * 3) % 17 === 0 ? 'white' : 'ice'));

/** Ladrilho da copa em névoa, com rejunte sálvia suave e uma peça por célula. */
export const kitchenChecker = texture((x, y) => (x === TILE - 1 || y === TILE - 1 ? 'celery' : 'mist'));

/** Taco em carvalho com diagonais largas e duas cores próximas. */
export const herringbone = texture((x, y) => {
  const phase = ((x < 8 ? x : 15 - x) + y) % 8;
  return phase === 0 ? 'oak' : 'oakLight';
});

/** Madeira escura: tábuas de 8 px em ferrugem, emenda em casca, veio em barro. */
export const woodDark = texture((x, y) => {
  const plank = Math.floor(y / 8);
  const rowInPlank = y % 8;
  if (rowInPlank === 7 || x === (plank * 9 + 4) % TILE) return 'bark';
  if ((rowInPlank === 2 && x === (plank * 5 + 11) % TILE) || (rowInPlank === 5 && x === (plank * 7 + 1) % TILE)) return 'clay';
  return 'rust';
});

/** Grama sálvia com poucos tufos de dois ou três pixels. */
export const grass = texture((x, y) => {
  if ((y === 4 && x === 3) || (y === 11 && x === 12)) return 'leaf';
  if ((y === 5 && (x === 3 || x === 4)) || (y === 12 && x === 12)) return 'celery';
  return 'sage';
});

/** Calçada com pedras de 8 px e juntas desencontradas que fecham ao repetir o tile. */
export const stonePath = texture((x, y) => {
  const offset = y < 8 ? 0 : 4;
  return y % 8 === 7 || (x + offset) % 8 === 7 ? 'gray' : 'mist';
});

/** Cimento queimado: névoa lisa com raros pontos cinza. */
export const concrete = texture((x, y) => ((x * 11 + y * 7) % 23 === 0 ? 'gray' : 'mist'));

/** Ladrilho sálvia de uma célula, na mesma escala que a copa e o lounge. */
export const sageTile = texture((x, y) => (x === TILE - 1 || y === TILE - 1 ? 'sage' : 'celery'));

/** Carpete de escritório com uma trama discreta, sem repetição de pontos brancos. */
export const grayCarpet = texture((x, y) => ((y === 6 || y === 13) && x >= 6 && x <= 7 ? 'celery' : 'mist'));

// ---- tapetes (16 tiles, um por combinação de bordas: máscara N=1, S=2, O=4, L=8) ----

export interface RugColors {
  edge: ColorName;
  stripe: ColorName;
  field: ColorName;
  motif: ColorName;
}

/**
 * Um tile do tapete. A borda tem 3 px (contorno, filete claro, campo) só nos lados de fora, então
 * qualquer retângulo de tiles fecha. O miolo tem um losango discreto por célula.
 */
function rugTile(colors: RugColors, north: boolean, south: boolean, west: boolean, east: boolean): Pixels {
  return texture((x, y) => {
    const fromEdge = Math.min(north ? y : 99, south ? TILE - 1 - y : 99, west ? x : 99, east ? TILE - 1 - x : 99);
    if (fromEdge === 0) return colors.edge;
    if (fromEdge === 2) return colors.stripe;
    if (Math.abs(x - 7) + Math.abs(y - 7) === 2) return colors.motif;
    return colors.field;
  });
}

/** 16 tiles por tapete, na ordem da máscara de bordas (N=1, S=2, O=4, L=8), como `paintRug` espera. */
export function rug(colors: RugColors): Pixels[] {
  return Array.from({ length: 16 }, (_, mask) =>
    rugTile(colors, (mask & 1) !== 0, (mask & 2) !== 0, (mask & 4) !== 0, (mask & 8) !== 0),
  );
}

export const RUG_LAVENDER: RugColors = { edge: 'mauve', stripe: 'mist', field: 'lilac', motif: 'lavender' };
export const RUG_SAGE: RugColors = { edge: 'fern', stripe: 'celery', field: 'sage', motif: 'celery' };
export const RUG_CREAM: RugColors = { edge: 'rosewood', stripe: 'oakLight', field: 'cream', motif: 'peach' };

// ---- paredes ----

/** Topo da parede visto de cima: claro, com a aresta de baixo um tom abaixo. */
export const wallTop = texture((_x, y) => {
  if (y === TILE - 1) return 'gray';
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
  const faceHex = wallFace.at(y)?.at(x);
  const frame = x === 2 || x === 13 || y === 3 || y === 11 || x === 7 || x === 8;
  const inside = x > 2 && x < 13 && y > 3 && y < 11;
  if (y === 12 && x >= 1 && x <= 14) return 'white';
  if (y === 11 && x >= 1 && x <= 14) return 'gray';
  if (x >= 2 && x <= 13 && y >= 3 && y <= 11 && frame) return y === 3 ? 'white' : 'mist';
  if (inside) {
    if ((x - y + 16) % 6 === 0 || (x - y + 16) % 6 === 1) return 'white';
    return y >= 8 ? 'sky' : 'ice';
  }
  // Fora da janela, repete a face da parede: o hex dela volta para o nome da cor, que é o que `texture` pede.
  return (Object.entries(PALETTE).find(([, hex]) => hex === faceHex)?.[0] ?? 'mist') as ColorName;
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
function onWall(draw: (canvas: Canvas) => void): Pixels {
  const canvas = new Canvas(TILE, TILE);
  draw(canvas);
  const overlay = canvas.toPixels();
  // Pixel transparente do desenho deixa aparecer a face da parede.
  return wallFace.map((row, y) => row.map((hex, x) => (overlay[y]?.[x] !== '.' ? (overlay[y]?.[x] ?? hex) : hex)));
}

/** Quadro abstrato: moldura clara e formas em pêssego, céu e mel. */
export const wallPainting = onWall((canvas) => {
  canvas.rect(3, 3, 10, 9, 'white').rect(4, 4, 8, 7, 'cream');
  canvas.rect(4, 7, 8, 4, 'peach').rect(8, 4, 4, 4, 'sky');
  canvas.rect(5, 5, 2, 2, 'honey').px(9, 8, 'coral').px(10, 9, 'coral');
  canvas.outline('rosewood');
});

/** Pôster com sol sobre céu, borda branca. */
export const wallPoster = onWall((canvas) => {
  canvas.rect(4, 3, 8, 10, 'white').rect(5, 4, 6, 8, 'ice');
  canvas.rect(5, 9, 6, 3, 'sky').rect(7, 5, 2, 2, 'gold').px(6, 6, 'honey').px(9, 6, 'honey');
  canvas.outline('blue');
});

/** Relógio redondo de parede. */
export const wallClock = onWall((canvas) => {
  const inside = (x: number, y: number) => Math.hypot(x - 7.5, y - 7.5) <= 4.6;
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) if (inside(x, y)) canvas.px(x, y, 'white');
  canvas.outline('dusk');
  canvas.px(7, 5, 'ink').px(7, 6, 'ink').px(7, 7, 'ink').px(8, 7, 'red').px(9, 7, 'red');
  canvas.px(7, 4, 'gray').px(4, 7, 'gray').px(11, 7, 'gray').px(7, 11, 'gray');
});

/** Lousa branca com rabiscos de caneta. */
export const wallWhiteboard = onWall((canvas) => {
  canvas.rect(1, 3, 14, 9, 'white');
  canvas.hline(3, 5, 6, 'sky').hline(3, 7, 9, 'blue').hline(3, 9, 4, 'red').px(10, 9, 'emerald').px(11, 8, 'emerald');
  canvas.outline('gray');
  canvas.hline(2, 12, 12, 'gray').px(4, 12, 'red').px(6, 12, 'blue');
});

/** Prateleira de parede com livros coloridos e um vasinho. */
export const wallShelf = onWall((canvas) => {
  const books: [number, ColorName, number][] = [
    [2, 'blue', 6],
    [3, 'coral', 5],
    [4, 'emerald', 6],
    [5, 'honey', 4],
    [7, 'violet', 6],
    [8, 'rose', 5],
  ];
  for (const [x, color, bookHeight] of books) canvas.rect(x, 11 - bookHeight, 1, bookHeight, color);
  canvas.rect(10, 8, 3, 3, 'white').px(11, 7, 'leaf').px(10, 6, 'emerald').px(12, 6, 'leaf');
  canvas.outline('ink');
  canvas.hline(1, 11, 14, 'tan').hline(1, 12, 14, 'rust');
});

/** Mural de cortiça com bilhetes. */
export const wallCorkboard = onWall((canvas) => {
  canvas.rect(2, 3, 12, 9, 'tan');
  canvas.rect(3, 4, 3, 3, 'lemon').rect(7, 5, 3, 3, 'pink').rect(10, 4, 3, 3, 'ice').rect(4, 8, 4, 3, 'white');
  canvas.px(4, 4, 'red').px(8, 5, 'blue').px(11, 4, 'red');
  canvas.outline('rust');
});

/** Planta pendurada num suporte, com ramos caindo. */
export const wallHangingPlant = onWall((canvas) => {
  canvas.rect(5, 6, 6, 3, 'white');
  canvas.outline('dusk');
  const leaves: [number, number][] = [[4, 5], [5, 4], [7, 4], [9, 4], [10, 5], [11, 6], [4, 9], [4, 10], [5, 11], [10, 9], [11, 10], [11, 11], [7, 9]];
  for (const [x, y] of leaves) canvas.px(x, y, (x + y) % 2 === 0 ? 'leaf' : 'emerald');
  canvas.px(8, 2, 'gray').px(8, 3, 'gray');
});

/** TV de parede: moldura escura e reflexo. */
export const wallTv = onWall((canvas) => {
  canvas.rect(2, 4, 12, 8, 'navy');
  canvas.px(3, 5, 'indigo').px(4, 5, 'indigo').px(3, 6, 'indigo').hline(5, 10, 6, 'indigo');
  canvas.outline('ink');
});

/** Janela dupla com cortina sálvia nas laterais. */
export const wallWindowCurtain = onWall((canvas) => {
  canvas.rect(3, 3, 10, 9, 'ice');
  for (let y = 4; y < 11; y++) canvas.px(3 + ((y + 2) % 6), y, 'white');
  canvas.rect(3, 8, 10, 3, 'sky').vline(8, 3, 9, 'mist');
  canvas.outline('white');
  canvas.rect(1, 2, 2, 11, 'sage').rect(13, 2, 2, 11, 'sage').vline(2, 2, 11, 'fern').vline(14, 2, 11, 'fern');
});
