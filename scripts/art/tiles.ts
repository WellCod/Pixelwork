// Tiles 16x16 de piso, parede, móveis e itens de mesa. A ordem de cada lista é a posição no
// tileset: só acrescentar no fim (os mapas salvos referenciam os tiles pela posição).
import { grid, pattern, type Pixels } from '../lib/pixels.ts';
import { officeChair, pottedPlant } from './office.ts';
import * as S from './surfaces.ts';

const T = 16;
const g = (label: string, rows: string[]) => grid(rows, T, label);

export interface TileArt {
  pixels: Pixels;
  collides?: boolean;
  itemId?: string;
}

// ---- pisos ----

export const FLOORS: TileArt[] = [
  { pixels: S.woodLight },
  { pixels: S.lilacCarpet },
  { pixels: S.kitchenChecker },
  // Daqui para baixo, só acrescentar. Tapetes: 16 tiles cada, na ordem da máscara de bordas.
  { pixels: S.creamTile },
  { pixels: S.grayCarpet },
  ...S.rug(S.RUG_LAVENDER).map((pixels) => ({ pixels })),
  ...S.rug(S.RUG_SAGE).map((pixels) => ({ pixels })),
  ...S.rug(S.RUG_CREAM).map((pixels) => ({ pixels })),
  { pixels: S.herringbone },
  { pixels: S.woodDark },
  { pixels: S.grass },
  { pixels: S.stonePath },
  { pixels: S.concrete },
  { pixels: S.sageTile },
  { pixels: S.iceCarpet },
]

// ---- paredes ----

export const WALLS: TileArt[] = [
  { pixels: S.wallTop },
  { pixels: S.wallFace },
  { pixels: S.wallWindow },
  // Daqui para baixo, só acrescentar.
  { pixels: S.wallFaceSage },
  { pixels: S.wallFaceCream },
  { pixels: S.wallPainting },
  { pixels: S.wallPoster },
  { pixels: S.wallClock },
  { pixels: S.wallWhiteboard },
  { pixels: S.wallShelf },
  { pixels: S.wallFaceLilac },
  { pixels: S.wallCorkboard },
  { pixels: S.wallHangingPlant },
  { pixels: S.wallTv },
  { pixels: S.wallWindowCurtain },
]

// ---- móveis ----

const desk = g('mesa', [
  '................',
  'KKKKKKKKKKKKKKKK',
  'KYYYYYxxxxxxxxxK',
  'KYxxxxxxxxxxxxxK',
  'KxxxxxxxxxxxxxwK',
  'KxxxxxxxxxxxxxwK',
  'KxxxxxxxxxxxxxwK',
  'KxxxxxxxxxxxxwwK',
  'KxxxxxxxxxxxxwwK',
  'KwwwwwwwwwwwwwwK',
  'KKKKKKKKKKKKKKKK',
  'KBBBBBBBBBBBBBBK',
  'KBbbbbbbbbbbbbBK',
  'KbK..........KbK',
  'KbK..........KbK',
  'KKK..........KKK',
]);

const sofa = g('sofa', [
  '................',
  '................',
  'KKKKKKKKKKKKKKKK',
  'KrRRRRRRRRRRRRrK',
  'KrRpRRRRRRRRRRrK',
  'KrRRRRRRRRRRRRrK',
  'KrrrrrrrrrrrrrrK',
  'KRRRRRRKRRRRRRRK',
  'KRpRRRRKRpRRRRRK',
  'KRRRRRRKRRRRRRRK',
  'KrrrrrrKrrrrrrrK',
  'KKKKKKKKKKKKKKKK',
  'KbK..........KbK',
  'KKK..........KKK',
  '................',
  '................',
]);

const meetingTable = pattern(T, (x, y) => {
  if (y === 0 || y === T - 1 || x === 0 || x === T - 1) return 'B';
  if (y % 5 === 2 && (x + y) % 3 === 0) return 'x';
  return y < 3 ? 'x' : 'w';
});

const door = g('porta', [
  'KKKKKKKKKKKKKKKK',
  'KBBBBBBBBBBBBBBK',
  'KBwwwwwwwwwwwwBK',
  'KBwxxxxxxxxxxwBK',
  'KBwxwwwwwwwwxwBK',
  'KBwxwwwwwwwwxwBK',
  'KBwxxxxxxxxxxwBK',
  'KBwwwwwwwwwwOwBK',
  'KBwxxxxxxxxxZwBK',
  'KBwxwwwwwwwwxwBK',
  'KBwxwwwwwwwwxwBK',
  'KBwxxxxxxxxxxwBK',
  'KBwwwwwwwwwwwwBK',
  'KBBBBBBBBBBBBBBK',
  'KbbbbbbbbbbbbbbK',
  'KKKKKKKKKKKKKKKK',
]);

const bookshelf = g('estante', [
  'KKKKKKKKKKKKKKKK',
  'KBBBBBBBBBBBBBBK',
  'KBRrUuVvOoMmZBBK',
  'KBRrUuVvOoMmZBBK',
  'KBRrUuVvOoMmZBBK',
  'KBBBBBBBBBBBBBBK',
  'KBuUoOvVBrRpYBBK',
  'KBuUoOvVBrRpYBBK',
  'KBuUoOvVBrRpYBBK',
  'KBBBBBBBBBBBBBBK',
  'KBMmZOBBRrcUvVBK',
  'KBMmZOBBRrcUvVBK',
  'KBMmZOBBRrcUvVBK',
  'KBBBBBBBBBBBBBBK',
  'KbbbbbbbbbbbbbbK',
  'KKKKKKKKKKKKKKKK',
]);

const waterCooler = g('bebedouro', [
  '.....KKKKKK.....',
  '....KcccccUK....',
  '....KcWcccUK....',
  '....KcccccUK....',
  '....KUUUUUuK....',
  '.....KKKKKK.....',
  '....KLLLLLGK....',
  '....KLWLLLGK....',
  '....KLKRKUGK....',
  '....KLLLLLGK....',
  '....KLLLLLGK....',
  '....KLLLLLGK....',
  '....KGGGGGgK....',
  '....KgggggnK....',
  '....KKKKKKKK....',
  '................',
]);

const coffeeMachine = g('cafe', [
  '................',
  '....KKKKKKKK....',
  '....KkkkkkkK....',
  '....KkRkkZkK....',
  '....KkkkkkkK....',
  '....KgggggnK....',
  '....KgK..KnK....',
  '....KgKWWKnK....',
  '....KgKWBKnK....',
  '....KgKKKKnK....',
  '....KggggnnK....',
  '....KKKKKKKK....',
  '...KLLLLLLLLK...',
  '...KGGGGGGGGK...',
  '...KKKKKKKKKK...',
  '................',
]);

const armchair = g('poltrona', [
  '................',
  '...KKKKKKKKKK...',
  '..KuUUUUUUUUuK..',
  '..KuUcUUUUUUuK..',
  '..KuUUUUUUUUuK..',
  '.KKuuuuuuuuuuKK.',
  '.KUKUUUUUUUUKUK.',
  '.KUKUcUUUUUUKUK.',
  '.KUKUUUUUUUUKUK.',
  '.KuKuuuuuuuuKuK.',
  '.KKKKKKKKKKKKKK.',
  '..KbK......KbK..',
  '..KKK......KKK..',
  '................',
  '................',
  '................',
]);

const rug = pattern(T, (x, y) => {
  if (x === 0 || y === 0 || x === T - 1 || y === T - 1) return 'r';
  if (x === 1 || y === 1 || x === T - 2 || y === T - 2) return 'O';
  if ((x + y) % 6 === 0 || (x - y + T) % 6 === 0) return 'Q';
  return 'q';
});

const tallPlant = g('planta-alta', [
  '.....KKKK.......',
  '...KKVvVVKK.....',
  '..KVvVfVvVvK....',
  '..KvfVvVfvVK....',
  '...KVvfvVvK.....',
  '..KvVvVfVvVK....',
  '..KfvVvVvfvK....',
  '...KKvfvKKK.....',
  '.....KbK........',
  '.....KbK........',
  '....KKKKKK......',
  '....KLLLLK......',
  '....KLGGLK......',
  '....KLLLLK......',
  '.....KKKK.......',
  '................',
]);

export const FURNITURE: TileArt[] = [
  { pixels: desk, collides: true, itemId: 'desk' },
  { pixels: officeChair, itemId: 'chair' },
  { pixels: pottedPlant, collides: true, itemId: 'plant' },
  { pixels: sofa, collides: true, itemId: 'sofa' },
  { pixels: meetingTable, collides: true, itemId: 'meeting-table' },
  { pixels: door, itemId: 'door' },
  // Daqui para baixo, só acrescentar.
  { pixels: bookshelf, collides: true, itemId: 'bookshelf' },
  { pixels: waterCooler, collides: true, itemId: 'water-cooler' },
  { pixels: coffeeMachine, collides: true, itemId: 'coffee-machine' },
  { pixels: armchair, collides: true, itemId: 'armchair' },
  { pixels: rug, itemId: 'rug' },
  { pixels: tallPlant, collides: true, itemId: 'plant-tall' },
];

// ---- itens de mesa (desenhados por cima do tile da mesa) ----

const deskDark = desk.map((row) =>
  row.map((ch) => ({ Y: 'G', x: 'g', w: 'n', B: 'k', b: 'K' })[ch] ?? ch),
);

const monitorSingle = g('monitor', [
  '................',
  '...KKKKKKKKKK...',
  '...KuuuuuuuuK...',
  '...KuUcUUUUuK...',
  '...KuUUUUUUuK...',
  '...KuUUUUUUuK...',
  '...KuuuuuuuuK...',
  '...KKKKKKKKKK...',
  '.......Kg.......',
  '......KggK......',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

const monitorDual = g('monitores', [
  '................',
  'KKKKKKKKKKKKKKK.',
  'KuuuuuuKuuuuuuK.',
  'KuUcUUuKuUcUUuK.',
  'KuUUUUuKuUUUUuK.',
  'KuUUUUuKuUUUUuK.',
  'KuuuuuuKuuuuuuK.',
  'KKKKKKKKKKKKKKK.',
  '...KgK....KgK...',
  '..KKKKK..KKKKK..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

const laptop = g('notebook', [
  '................',
  '................',
  '....KKKKKKKK....',
  '....KuuuuuuK....',
  '....KuUcUUuK....',
  '....KuUUUUuK....',
  '....KuuuuuuK....',
  '...KKKKKKKKKK...',
  '...KLLLLLLLLK...',
  '...KLGLGLGLLK...',
  '...KGGGGGGGGK...',
  '...KKKKKKKKKK...',
  '................',
  '................',
  '................',
  '................',
]);

const mug = g('caneca', [
  '................',
  '................',
  '................',
  '................',
  '......KKKK......',
  '.....KWWWWK.....',
  '.....KbbbbKK....',
  '.....KWWWWKWK...',
  '.....KRRRRKWK...',
  '.....KWWWWKK....',
  '.....KLLLLK.....',
  '......KKKK......',
  '................',
  '................',
  '................',
  '................',
]);

const poster = g('poster', [
  '..KKKKKKKKKKKK..',
  '..KWWWWWWWWWWK..',
  '..KWUUUUUUUUWK..',
  '..KWUUUUZUUUWK..',
  '..KWUUUZZZUUWK..',
  '..KWUUUUZUUUWK..',
  '..KWVVUUUUVVWK..',
  '..KWvVVUUVVvWK..',
  '..KWvvVVVVvvWK..',
  '..KWWWWWWWWWWK..',
  '..KKKKKKKKKKKK..',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

const plantSmall = g('planta-pequena', [
  '................',
  '................',
  '................',
  '.......KK.......',
  '.....KKVvKK.....',
  '....KvVvVVvK....',
  '....KVfvVfVK....',
  '.....KvVvfK.....',
  '.....KKKKKK.....',
  '.....KQQQqK.....',
  '.....KQQQqK.....',
  '......KKKK......',
  '................',
  '................',
  '................',
  '................',
]);

const lamp = g('luminaria', [
  '................',
  '................',
  '......KKKKK.....',
  '.....KOZZZOK....',
  '....KOOOOOOOK...',
  '....KKKKKKKKK...',
  '........Kg......',
  '.......Kg.......',
  '......Kg........',
  '.....KgK........',
  '....KKKKKK......',
  '....KggggK......',
  '....KKKKKK......',
  '................',
  '................',
  '................',
]);

const books = g('livros', [
  '................',
  '................',
  '................',
  '................',
  '....KKKKKKKK....',
  '....KRRRRRRK....',
  '....KrrrrrrK....',
  '...KKKKKKKKKK...',
  '...KUUUUUUUUK...',
  '...KuuuuuuuuK...',
  '....KKKKKKKK....',
  '....KVVVVVVK....',
  '....KvvvvvvK....',
  '....KKKKKKKK....',
  '................',
  '................',
]);

const clock = g('relogio', [
  '.....KKKKKK.....',
  '....KWWWWWWK....',
  '...KWWWKWWWWK...',
  '...KWWWKWWWWK...',
  '...KWWWKKKWWK...',
  '...KWWWWWWWWK...',
  '....KWWWWWWK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

const bin = g('lixeira', [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.....KKKKKK.....',
  '....KGGGGGGK....',
  '....KKKKKKKK....',
  '....KLGLGLGK....',
  '....KLGLGLGK....',
  '....KLGLGLGK....',
  '....KLGLGLGK....',
  '.....KKKKKK.....',
  '................',
  '................',
  '................',
]);

export const DESK_DECOR: TileArt[] = [
  { pixels: desk, collides: true, itemId: 'basic' },
  { pixels: monitorSingle, itemId: 'monitor-single' },
  { pixels: monitorDual, itemId: 'monitor-dual' },
  { pixels: laptop, itemId: 'monitor-laptop' },
  { pixels: mug, itemId: 'mug' },
  { pixels: poster, itemId: 'poster' },
  { pixels: plantSmall, itemId: 'plant-small' },
  // Daqui para baixo, só acrescentar.
  { pixels: deskDark, collides: true, itemId: 'dark' },
  { pixels: lamp, itemId: 'lamp' },
  { pixels: books, itemId: 'books' },
  { pixels: clock, itemId: 'clock' },
  { pixels: bin, itemId: 'bin' },
];
