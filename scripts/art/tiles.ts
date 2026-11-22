// Tiles 16x16 de piso, parede, móveis e itens de mesa. A ordem de cada lista é a posição no
// tileset: só acrescentar no fim (os mapas salvos referenciam os tiles pela posição).
import type { Pixels } from '../lib/pixels.ts';
import * as D from './desk-decor.ts';
import * as F from './furniture-small.ts';
import * as S from './surfaces.ts';


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


const halves = {
  basic: D.deskHalves(D.DESK_STYLES.basic),
  dark: D.deskHalves(D.DESK_STYLES.dark),
  white: D.deskHalves(D.DESK_STYLES.white),
};
/** Metades da mesa larga de uma variante: `-wide-l`/`-wide-r` (32x16) e `-tall-t`/`-tall-b` (16x32). */
const halvesOf = (variant: keyof typeof halves): TileArt[] => [
  { pixels: halves[variant].wide[0] ?? [], collides: true, itemId: `${variant}-wide-l` },
  { pixels: halves[variant].wide[1] ?? [], collides: true, itemId: `${variant}-wide-r` },
  { pixels: halves[variant].tall[0] ?? [], collides: true, itemId: `${variant}-tall-t` },
  { pixels: halves[variant].tall[1] ?? [], collides: true, itemId: `${variant}-tall-b` },
];

export const DESK_DECOR: TileArt[] = [
  { pixels: F.desk, collides: true, itemId: 'basic' },
  { pixels: D.monitorSingle, itemId: 'monitor-single' },
  { pixels: D.monitorDual, itemId: 'monitor-dual' },
  { pixels: D.laptop, itemId: 'monitor-laptop' },
  { pixels: D.mug, itemId: 'mug' },
  { pixels: D.poster, itemId: 'poster' },
  { pixels: D.plantSmall, itemId: 'plant-small' },
  // Daqui para baixo, só acrescentar.
  { pixels: F.deskDarkWood, collides: true, itemId: 'dark' },
  { pixels: D.lamp, itemId: 'lamp' },
  { pixels: D.books, itemId: 'books' },
  { pixels: D.clock, itemId: 'clock' },
  { pixels: D.bin, itemId: 'bin' },
  { pixels: D.whiteDesk, collides: true, itemId: 'white' },
  ...halvesOf('basic'),
  ...halvesOf('dark'),
  ...halvesOf('white'),
  { pixels: D.pencilCup, itemId: 'pencil-cup' },
  { pixels: D.headphones, itemId: 'headphones' },
  { pixels: D.miniCactus, itemId: 'cactus-mini' },
  { pixels: D.photoFrame, itemId: 'photo' },
  { pixels: D.waterBottle, itemId: 'water-bottle' },
  { pixels: D.stickyNotes, itemId: 'sticky-notes' },
  { pixels: D.deskSpeaker, itemId: 'speaker' },
  { pixels: D.takeawayCoffee, itemId: 'takeaway-coffee' },
  { pixels: D.trophy, itemId: 'trophy' },
  { pixels: D.rubberDuck, itemId: 'duck' },
  { pixels: D.calendar, itemId: 'calendar' },
  { pixels: D.wallShelfMini, itemId: 'shelf-mini' },
  { pixels: D.framedPhoto, itemId: 'framed-photo' },
  { pixels: D.backpack, itemId: 'backpack' },
  { pixels: D.vaseTall, itemId: 'vase-tall' },
  { pixels: D.sleepingCat, itemId: 'cat' },
]
