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
  { pixels: S.woodLight, itemId: 'wood-light' },
  { pixels: S.lilacCarpet, itemId: 'carpet-lilac' },
  { pixels: S.kitchenChecker, itemId: 'kitchen-checker' },
  // Daqui para baixo, só acrescentar. Tapetes: 16 tiles cada, na ordem da máscara de bordas; o
  // primeiro (máscara 0) leva o item_id do tapete.
  { pixels: S.creamTile, itemId: 'tile-cream' },
  { pixels: S.grayCarpet, itemId: 'carpet-gray' },
  ...rugTiles(S.RUG_LAVENDER, 'rug-lavender'),
  ...rugTiles(S.RUG_SAGE, 'rug-sage'),
  ...rugTiles(S.RUG_CREAM, 'rug-cream'),
  { pixels: S.herringbone, itemId: 'wood-herringbone' },
  { pixels: S.woodDark, itemId: 'wood-dark' },
  { pixels: S.grass, itemId: 'grass' },
  { pixels: S.stonePath, itemId: 'stone-path' },
  { pixels: S.concrete, itemId: 'concrete' },
  { pixels: S.sageTile, itemId: 'tile-sage' },
  { pixels: S.iceCarpet, itemId: 'carpet-ice' },
]

function rugTiles(colors: S.RugColors, itemId: string): TileArt[] {
  return S.rug(colors).map((pixels, mask) => (mask === 0 ? { pixels, itemId } : { pixels }));
}

// ---- paredes ----

export const WALLS: TileArt[] = [
  { pixels: S.wallTop, itemId: 'wall-top' },
  { pixels: S.wallFace, itemId: 'wall' },
  { pixels: S.wallWindow, itemId: 'wall-window' },
  // Daqui para baixo, só acrescentar.
  { pixels: S.wallFaceSage, itemId: 'wall-sage' },
  { pixels: S.wallFaceCream, itemId: 'wall-cream' },
  { pixels: S.wallPainting, itemId: 'wall-painting' },
  { pixels: S.wallPoster, itemId: 'wall-poster' },
  { pixels: S.wallClock, itemId: 'wall-clock' },
  { pixels: S.wallWhiteboard, itemId: 'wall-whiteboard' },
  { pixels: S.wallShelf, itemId: 'wall-shelf' },
  { pixels: S.wallFaceLilac, itemId: 'wall-lilac' },
  { pixels: S.wallCorkboard, itemId: 'wall-corkboard' },
  { pixels: S.wallHangingPlant, itemId: 'wall-plant' },
  { pixels: S.wallTv, itemId: 'wall-tv' },
  { pixels: S.wallWindowCurtain, itemId: 'wall-window-curtain' },
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
  { pixels: D.dividerSingle, itemId: 'divider' },
  { pixels: D.dividerWide[0] ?? [], itemId: 'divider-wide-l' },
  { pixels: D.dividerWide[1] ?? [], itemId: 'divider-wide-r' },
  { pixels: D.dividerSide, itemId: 'divider-side' },
]
