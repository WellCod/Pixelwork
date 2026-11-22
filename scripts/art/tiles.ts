// Tiles 16x16 de piso, parede, móveis e itens de mesa. A ordem de cada lista é a posição no
// tileset: só acrescentar no fim (os mapas salvos referenciam os tiles pela posição).
import { grid, pattern, type Pixels } from '../lib/pixels.ts';
import * as F from './furniture-small.ts';
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

export const FURNITURE: TileArt[] = [
  { pixels: F.desk, collides: true, itemId: 'desk' },
  { pixels: F.officeChair, itemId: 'chair' },
  { pixels: F.pottedPlant, collides: true, itemId: 'plant' },
  { pixels: F.loveseat, collides: true, itemId: 'sofa' },
  { pixels: F.meetingTableTile, collides: true, itemId: 'meeting-table' },
  { pixels: F.door, itemId: 'door' },
  // Daqui para baixo, só acrescentar.
  { pixels: F.bookshelf, collides: true, itemId: 'bookshelf' },
  { pixels: F.waterCooler, collides: true, itemId: 'water-cooler' },
  { pixels: F.coffeeMachine, collides: true, itemId: 'coffee-machine' },
  { pixels: F.armchair, collides: true, itemId: 'armchair' },
  { pixels: F.doormat, itemId: 'rug' },
  { pixels: F.tallPlant, collides: true, itemId: 'plant-tall' },
  { pixels: F.officeChairBack, itemId: 'chair-back' },
  { pixels: F.officeChairSide, itemId: 'chair-left' },
  { pixels: F.officeChairRight, itemId: 'chair-right' },
  { pixels: F.kitchenChair, itemId: 'kitchen-chair' },
  { pixels: F.beanbagBlue, collides: true, itemId: 'beanbag-blue' },
  { pixels: F.beanbagPink, collides: true, itemId: 'beanbag-pink' },
  { pixels: F.beanbagYellow, collides: true, itemId: 'beanbag-yellow' },
  { pixels: F.cactus, collides: true, itemId: 'cactus' },
  { pixels: F.monstera, collides: true, itemId: 'monstera' },
  { pixels: F.snakePlant, collides: true, itemId: 'snake-plant' },
  { pixels: F.flowerPot, collides: true, itemId: 'flowers' },
  { pixels: F.ficus, collides: true, itemId: 'ficus' },
  { pixels: F.succulent, collides: true, itemId: 'succulent' },
  { pixels: F.floorLamp, collides: true, itemId: 'floor-lamp' },
  { pixels: F.trashBin, collides: true, itemId: 'trash-bin' },
  { pixels: F.printer, collides: true, itemId: 'printer' },
  { pixels: F.coatRack, collides: true, itemId: 'coat-rack' },
  { pixels: F.fireExtinguisher, collides: true, itemId: 'fire-extinguisher' },
  { pixels: F.cardboardBox, collides: true, itemId: 'cardboard-box' },
  { pixels: F.barStool, itemId: 'bar-stool' },
  { pixels: F.sideTable, collides: true, itemId: 'side-table' },
]

// ---- itens de mesa (desenhados por cima do tile da mesa) ----


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
  { pixels: F.desk, collides: true, itemId: 'basic' },
  { pixels: monitorSingle, itemId: 'monitor-single' },
  { pixels: monitorDual, itemId: 'monitor-dual' },
  { pixels: laptop, itemId: 'monitor-laptop' },
  { pixels: mug, itemId: 'mug' },
  { pixels: poster, itemId: 'poster' },
  { pixels: plantSmall, itemId: 'plant-small' },
  // Daqui para baixo, só acrescentar.
  { pixels: F.deskDarkWood, collides: true, itemId: 'dark' },
  { pixels: lamp, itemId: 'lamp' },
  { pixels: books, itemId: 'books' },
  { pixels: clock, itemId: 'clock' },
  { pixels: bin, itemId: 'bin' },
];
