// Tiles 16x16 de piso, parede, móveis e itens de mesa. A ordem de cada lista é a posição no
// tileset: só acrescentar no fim (os mapas salvos referenciam os tiles pela posição).
import type { Pixels } from '../lib/pixels.ts';
import * as deskDecor from './desk-decor.ts';
import * as halloween from './halloween.ts';
import * as smallFurniture from './furniture-small.ts';
import * as surfaces from './surfaces.ts';


export interface TileArt {
  pixels: Pixels;
  collides?: boolean;
  itemId?: string;
}

// ---- pisos ----

export const FLOORS: TileArt[] = [
  { pixels: surfaces.woodLight, itemId: 'wood-light' },
  { pixels: surfaces.lilacCarpet, itemId: 'carpet-lilac' },
  { pixels: surfaces.kitchenChecker, itemId: 'kitchen-checker' },
  // Daqui para baixo, só acrescentar. Tapetes: 16 tiles cada, na ordem da máscara de bordas; o
  // primeiro (máscara 0) leva o item_id do tapete.
  { pixels: surfaces.creamTile, itemId: 'tile-cream' },
  { pixels: surfaces.grayCarpet, itemId: 'carpet-gray' },
  ...rugTiles(surfaces.RUG_LAVENDER, 'rug-lavender'),
  ...rugTiles(surfaces.RUG_SAGE, 'rug-sage'),
  ...rugTiles(surfaces.RUG_CREAM, 'rug-cream'),
  { pixels: surfaces.herringbone, itemId: 'wood-herringbone' },
  { pixels: surfaces.woodDark, itemId: 'wood-dark' },
  { pixels: surfaces.grass, itemId: 'grass' },
  { pixels: surfaces.stonePath, itemId: 'stone-path' },
  { pixels: surfaces.concrete, itemId: 'concrete' },
  { pixels: surfaces.sageTile, itemId: 'tile-sage' },
  { pixels: surfaces.iceCarpet, itemId: 'carpet-ice' },
]

/** Os 16 tiles de um tapete, um por máscara de bordas; só o primeiro (máscara 0) leva o item_id. */
function rugTiles(colors: surfaces.RugColors, itemId: string): TileArt[] {
  return surfaces.rug(colors).map((pixels, mask) => (mask === 0 ? { pixels, itemId } : { pixels }));
}

// ---- paredes ----

export const WALLS: TileArt[] = [
  { pixels: surfaces.wallTop, itemId: 'wall-top' },
  { pixels: surfaces.wallFace, itemId: 'wall' },
  { pixels: surfaces.wallWindow, itemId: 'wall-window' },
  // Daqui para baixo, só acrescentar.
  { pixels: surfaces.wallFaceSage, itemId: 'wall-sage' },
  { pixels: surfaces.wallFaceCream, itemId: 'wall-cream' },
  { pixels: surfaces.wallPainting, itemId: 'wall-painting' },
  { pixels: surfaces.wallPoster, itemId: 'wall-poster' },
  { pixels: surfaces.wallClock, itemId: 'wall-clock' },
  { pixels: surfaces.wallWhiteboard, itemId: 'wall-whiteboard' },
  { pixels: surfaces.wallShelf, itemId: 'wall-shelf' },
  { pixels: surfaces.wallFaceLilac, itemId: 'wall-lilac' },
  { pixels: surfaces.wallCorkboard, itemId: 'wall-corkboard' },
  { pixels: surfaces.wallHangingPlant, itemId: 'wall-plant' },
  { pixels: surfaces.wallTv, itemId: 'wall-tv' },
  { pixels: surfaces.wallWindowCurtain, itemId: 'wall-window-curtain' },
  { pixels: surfaces.wallDivider, itemId: 'wall-divider' },
]

// ---- móveis ----

export const FURNITURE: TileArt[] = [
  { pixels: smallFurniture.desk, collides: true, itemId: 'desk' },
  { pixels: smallFurniture.officeChair, itemId: 'chair' },
  { pixels: smallFurniture.pottedPlant, collides: true, itemId: 'plant' },
  { pixels: smallFurniture.loveseat, collides: true, itemId: 'sofa' },
  { pixels: smallFurniture.meetingTableTile, collides: true, itemId: 'meeting-table' },
  { pixels: smallFurniture.door, itemId: 'door' },
  // Daqui para baixo, só acrescentar.
  { pixels: smallFurniture.bookshelf, collides: true, itemId: 'bookshelf' },
  { pixels: smallFurniture.waterCooler, collides: true, itemId: 'water-cooler' },
  { pixels: smallFurniture.coffeeMachine, collides: true, itemId: 'coffee-machine' },
  { pixels: smallFurniture.armchair, collides: true, itemId: 'armchair' },
  { pixels: smallFurniture.doormat, itemId: 'rug' },
  { pixels: smallFurniture.tallPlant, collides: true, itemId: 'plant-tall' },
  { pixels: smallFurniture.officeChairBack, itemId: 'chair-back' },
  { pixels: smallFurniture.officeChairSide, itemId: 'chair-left' },
  { pixels: smallFurniture.officeChairRight, itemId: 'chair-right' },
  { pixels: smallFurniture.kitchenChair, itemId: 'kitchen-chair' },
  { pixels: smallFurniture.beanbagBlue, collides: true, itemId: 'beanbag-blue' },
  { pixels: smallFurniture.beanbagPink, collides: true, itemId: 'beanbag-pink' },
  { pixels: smallFurniture.beanbagYellow, collides: true, itemId: 'beanbag-yellow' },
  { pixels: smallFurniture.cactus, collides: true, itemId: 'cactus' },
  { pixels: smallFurniture.monstera, collides: true, itemId: 'monstera' },
  { pixels: smallFurniture.snakePlant, collides: true, itemId: 'snake-plant' },
  { pixels: smallFurniture.flowerPot, collides: true, itemId: 'flowers' },
  { pixels: smallFurniture.ficus, collides: true, itemId: 'ficus' },
  { pixels: smallFurniture.succulent, collides: true, itemId: 'succulent' },
  { pixels: smallFurniture.floorLamp, collides: true, itemId: 'floor-lamp' },
  { pixels: smallFurniture.trashBin, collides: true, itemId: 'trash-bin' },
  { pixels: smallFurniture.printer, collides: true, itemId: 'printer' },
  { pixels: smallFurniture.coatRack, collides: true, itemId: 'coat-rack' },
  { pixels: smallFurniture.fireExtinguisher, collides: true, itemId: 'fire-extinguisher' },
  { pixels: smallFurniture.cardboardBox, collides: true, itemId: 'cardboard-box' },
  { pixels: smallFurniture.barStool, itemId: 'bar-stool' },
  { pixels: smallFurniture.sideTable, collides: true, itemId: 'side-table' },
]

// ---- itens de mesa (desenhados por cima do tile da mesa) ----


const halves = {
  basic: deskDecor.deskHalves(deskDecor.DESK_STYLES.basic),
  dark: deskDecor.deskHalves(deskDecor.DESK_STYLES.dark),
  white: deskDecor.deskHalves(deskDecor.DESK_STYLES.white),
  'halloween-twilight': deskDecor.deskHalves(deskDecor.DESK_STYLES.twilight),
};
/** Metades da mesa larga de uma variante: `-wide-l`/`-wide-r` (32x16) e `-tall-t`/`-tall-b` (16x32). */
const halvesOf = (variant: keyof typeof halves): TileArt[] => [
  { pixels: halves[variant].wide[0] ?? [], collides: true, itemId: `${variant}-wide-l` },
  { pixels: halves[variant].wide[1] ?? [], collides: true, itemId: `${variant}-wide-r` },
  { pixels: halves[variant].tall[0] ?? [], collides: true, itemId: `${variant}-tall-t` },
  { pixels: halves[variant].tall[1] ?? [], collides: true, itemId: `${variant}-tall-b` },
];

export const DESK_DECOR: TileArt[] = [
  { pixels: smallFurniture.desk, collides: true, itemId: 'basic' },
  { pixels: deskDecor.monitorSingle, itemId: 'monitor-single' },
  { pixels: deskDecor.monitorDual, itemId: 'monitor-dual' },
  { pixels: deskDecor.laptop, itemId: 'monitor-laptop' },
  { pixels: deskDecor.mug, itemId: 'mug' },
  { pixels: deskDecor.poster, itemId: 'poster' },
  { pixels: deskDecor.plantSmall, itemId: 'plant-small' },
  // Daqui para baixo, só acrescentar.
  { pixels: smallFurniture.deskDarkWood, collides: true, itemId: 'dark' },
  { pixels: deskDecor.lamp, itemId: 'lamp' },
  { pixels: deskDecor.books, itemId: 'books' },
  { pixels: deskDecor.clock, itemId: 'clock' },
  { pixels: deskDecor.bin, itemId: 'bin' },
  { pixels: deskDecor.whiteDesk, collides: true, itemId: 'white' },
  ...halvesOf('basic'),
  ...halvesOf('dark'),
  ...halvesOf('white'),
  { pixels: deskDecor.pencilCup, itemId: 'pencil-cup' },
  { pixels: deskDecor.headphones, itemId: 'headphones' },
  { pixels: deskDecor.miniCactus, itemId: 'cactus-mini' },
  { pixels: deskDecor.photoFrame, itemId: 'photo' },
  { pixels: deskDecor.waterBottle, itemId: 'water-bottle' },
  { pixels: deskDecor.stickyNotes, itemId: 'sticky-notes' },
  { pixels: deskDecor.deskSpeaker, itemId: 'speaker' },
  { pixels: deskDecor.takeawayCoffee, itemId: 'takeaway-coffee' },
  { pixels: deskDecor.trophy, itemId: 'trophy' },
  { pixels: deskDecor.rubberDuck, itemId: 'duck' },
  { pixels: deskDecor.calendar, itemId: 'calendar' },
  { pixels: deskDecor.wallShelfMini, itemId: 'shelf-mini' },
  { pixels: deskDecor.framedPhoto, itemId: 'framed-photo' },
  { pixels: deskDecor.backpack, itemId: 'backpack' },
  { pixels: deskDecor.vaseTall, itemId: 'vase-tall' },
  { pixels: deskDecor.sleepingCat, itemId: 'cat' },
  { pixels: deskDecor.dividerSingle, itemId: 'divider' },
  { pixels: deskDecor.dividerWide[0] ?? [], itemId: 'divider-wide-l' },
  { pixels: deskDecor.dividerWide[1] ?? [], itemId: 'divider-wide-r' },
  { pixels: deskDecor.dividerSide, itemId: 'divider-side' },
];

// Novo tileset para não alterar os GIDs do desk-decor em mapas compactados pelo Tiled.
export const DESK_DECOR_EXTRAS: TileArt[] = [
  { pixels: deskDecor.mechanicalKeyboard, itemId: 'mechanical-keyboard' },
  { pixels: deskDecor.terrarium, itemId: 'terrarium' },
  { pixels: deskDecor.drawingTablet, itemId: 'drawing-tablet' },
  { pixels: deskDecor.teaSet, itemId: 'tea-set' },
  { pixels: deskDecor.handheld, itemId: 'handheld' },
  { pixels: deskDecor.wallVinyl, itemId: 'wall-vinyl' },
  { pixels: deskDecor.moonPrint, itemId: 'moon-print' },
  { pixels: deskDecor.wallPennant, itemId: 'wall-pennant' },
  { pixels: deskDecor.wovenBasket, itemId: 'woven-basket' },
  { pixels: deskDecor.floorCorgi, itemId: 'floor-corgi' },
  { pixels: deskDecor.monitorSingleBack, itemId: 'monitor-single-back' },
  { pixels: deskDecor.monitorDualBack, itemId: 'monitor-dual-back' },
  { pixels: deskDecor.laptopBack, itemId: 'monitor-laptop-back' },
  { pixels: deskDecor.monitorSingleSide, itemId: 'monitor-single-side' },
  { pixels: deskDecor.monitorDualSide, itemId: 'monitor-dual-side' },
  { pixels: deskDecor.laptopSide, itemId: 'monitor-laptop-side' },
];

export const DESK_DECOR_HALLOWEEN: TileArt[] = [
  { pixels: deskDecor.twilightDesk, collides: true, itemId: 'halloween-twilight' },
  ...halvesOf('halloween-twilight'),
  { pixels: halloween.deskPumpkin, itemId: 'halloween-pumpkin-lamp' },
  { pixels: halloween.potion, itemId: 'halloween-potion' },
  { pixels: halloween.spellbook, itemId: 'halloween-spellbook' },
  { pixels: halloween.skull, itemId: 'halloween-skull' },
  { pixels: halloween.cobweb, itemId: 'halloween-cobweb' },
  { pixels: halloween.garland, itemId: 'halloween-garland' },
  { pixels: halloween.blackCat, itemId: 'halloween-black-cat' },
  { pixels: halloween.candyBucket, itemId: 'halloween-candy-bucket' },
];

export const FURNITURE_HALLOWEEN: TileArt[] = [
  { pixels: halloween.cauldron, collides: true, itemId: 'halloween-cauldron' },
  { pixels: halloween.candelabra, collides: true, itemId: 'halloween-candelabra' },
  { pixels: halloween.tombstone, collides: true, itemId: 'halloween-tombstone' },
  { pixels: halloween.ghostMat, itemId: 'halloween-ghost-mat' },
  { pixels: halloween.familiarCushion, itemId: 'halloween-familiar-cushion' },
];

export const FURNITURE_2X1_HALLOWEEN: TileArt[] = [
  { pixels: halloween.pumpkinPair, collides: true, itemId: 'halloween-pumpkin-pair' },
  { pixels: halloween.vampireSofa, collides: true, itemId: 'halloween-vampire-sofa' },
  { pixels: halloween.treatTable, collides: true, itemId: 'halloween-treat-table' },
]
