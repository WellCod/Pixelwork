// Gera maps/templates/small-office.json, o mapa do coworking de demonstração (redesenho visual de
// 2026-11): escritório claro com área de produto e de engenharia (mesas largas), sala de reunião,
// lounge, copa, área de jogos e jardim. Depois de editado no Tiled, o JSON passa a ser a fonte e
// este script não deve mais rodar.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TILESETS, compileMap, type TilesetId } from '@pixelwork/shared';
import { RUGS, rugMask, type RugId } from '@pixelwork/shared/editor';
import { FIRSTGID } from '@pixelwork/shared/testing';

const W = 40;
const H = 28;
const T = 16;

// Pisos e paredes pelos frames dos tilesets (scripts/art/surfaces.ts).
const FLOOR = { woodLight: 0, kitchen: 2, cream: 3, gray: 4, herringbone: 53, grass: 55, stone: 56, sageTile: 58 };
const WALL = {
  top: 0, face: 1, window: 2, sage: 3, cream: 4, painting: 5, poster: 6, clock: 7, whiteboard: 8, shelf: 9,
  lilac: 10, cork: 11, hangingPlant: 12, tv: 13, curtain: 14,
};

const floor = new Array<number>(W * H).fill(FIRSTGID.floors + FLOOR.woodLight);
const walls = new Array<number>(W * H).fill(0);
const at = (x: number, y: number) => y * W + x;
const paint = (layer: number[], x0: number, y0: number, w: number, h: number, gid: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) layer[at(x, y)] = gid;
};
const floorRect = (frame: number, x: number, y: number, w: number, h: number) => paint(floor, x, y, w, h, FIRSTGID.floors + frame);
const wall = (frame: number, x: number, y: number) => (walls[at(x, y)] = FIRSTGID.walls + frame);
const rug = (id: RugId, x0: number, y0: number, w: number, h: number) => {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) floor[at(x0 + x, y0 + y)] = FIRSTGID.floors + RUGS[id].first + rugMask(x, y, w, h);
  }
};

// ---- pisos por área ----
floorRect(FLOOR.woodLight, 1, 2, 12, 10); // produto
floorRect(FLOOR.gray, 13, 2, 13, 10); // engenharia
floorRect(FLOOR.gray, 27, 2, 12, 9); // sala de reunião
floorRect(FLOOR.herringbone, 1, 12, 38, 2); // corredor
floorRect(FLOOR.cream, 1, 14, 12, 13); // lounge
floorRect(FLOOR.kitchen, 13, 14, 12, 13); // copa
floorRect(FLOOR.sageTile, 25, 14, 14, 7); // jogos
floorRect(FLOOR.grass, 25, 21, 14, 6); // jardim
floorRect(FLOOR.stone, 25, 23, 14, 1);
rug('lavender', 2, 17, 8, 6);
rug('sage', 28, 15, 9, 5);
rug('lavender', 29, 4, 8, 5);

// ---- paredes: topo em volta, face clara no alto com janelas e decoração ----
for (let x = 0; x < W; x++) {
  wall(WALL.top, x, 0);
  wall(WALL.top, x, H - 1);
}
for (let y = 0; y < H; y++) {
  wall(WALL.top, 0, y);
  wall(WALL.top, W - 1, y);
}
const faceRow: [number, number][] = [
  [1, WALL.face], [2, WALL.window], [3, WALL.face], [4, WALL.painting], [5, WALL.window], [6, WALL.face],
  [7, WALL.clock], [8, WALL.window], [9, WALL.face], [10, WALL.poster], [11, WALL.window], [12, WALL.face],
  [13, WALL.cork], [14, WALL.window], [15, WALL.face], [16, WALL.whiteboard], [17, WALL.whiteboard], [18, WALL.face],
  [19, WALL.window], [20, WALL.shelf], [21, WALL.window], [22, WALL.face], [23, WALL.hangingPlant], [24, WALL.window],
  [25, WALL.face], [26, WALL.top], [27, WALL.lilac], [28, WALL.curtain], [29, WALL.lilac], [30, WALL.tv], [31, WALL.tv],
  [32, WALL.lilac], [33, WALL.curtain], [34, WALL.lilac], [35, WALL.painting], [36, WALL.lilac], [37, WALL.curtain], [38, WALL.lilac],
];
for (const [x, frame] of faceRow) wall(frame, x, 1);
// Sala de reunião: parede lateral (topo) e frente com porta dupla em (31, 11) e (32, 11).
for (let y = 1; y <= 11; y++) wall(WALL.top, 26, y);
for (let x = 26; x < W - 1; x++) if (x !== 31 && x !== 32) wall(WALL.lilac, x, 11);

// ---- objetos ----
let nextId = 1;
const obj = (extra: Record<string, unknown>) => ({
  id: nextId++,
  name: '',
  type: '',
  rotation: 0,
  visible: true,
  width: 0,
  height: 0,
  ...extra,
});
const props = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, type: 'string', value }));

/** Frame do item no tileset, pelo item_id do catálogo. */
function frameOf(tileset: TilesetId, item: string): number {
  const entry = Object.entries(TILESETS[tileset].items).find(([, id]) => id === item);
  if (!entry) throw new Error(`${tileset} sem o item ${item}`);
  return Number(entry[0]);
}

/** Móvel com âncora no tile de baixo à esquerda (x, y). */
const put = (tileset: TilesetId, item: string, x: number, y: number) => {
  const { tileWidth, tileHeight } = TILESETS[tileset];
  return obj({ gid: FIRSTGID[tileset] + frameOf(tileset, item), x: x * T, y: (y + 1) * T, width: tileWidth, height: tileHeight });
};
const small = (item: string, x: number, y: number) => put('furniture', item, x, y);

const furniture = [
  // Produto e engenharia: plantas nos cantos, estantes e lousa.
  small('monstera', 1, 2), small('plant-tall', 12, 2), small('snake-plant', 1, 11), small('ficus', 12, 11),
  put('furniture-2x2', 'bookshelf-tall', 13, 3), small('printer', 13, 6), small('trash-bin', 13, 10),
  small('plant', 25, 2), small('cactus', 25, 11), put('furniture-2x2', 'whiteboard', 23, 11 - 1), small('flowers', 14, 11),
  // Sala de reunião: mesa comprida sobre o tapete, lousa e plantas.
  put('furniture-3x2', 'meeting-table-long', 31, 7), small('plant-tall', 27, 2), small('plant-tall', 38, 2),
  small('floor-lamp', 27, 10), small('ficus', 38, 10), small('door', 31, 11), small('door', 32, 11),
  // Corredor.
  small('plant', 1, 12), small('plant', 38, 12), small('water-cooler', 24, 12),
  // Lounge: sofás no tapete, mesa de centro, pufes, estante e luzes.
  put('furniture-3x2', 'sofa-l', 3, 19), put('furniture-2x1', 'coffee-table', 4, 20),
  put('furniture-2x1', 'sofa-sage', 4, 22), small('armchair', 8, 20), small('side-table', 9, 18),
  small('beanbag-pink', 10, 21), small('beanbag-blue', 11, 23), small('floor-lamp', 2, 23),
  put('furniture-2x2', 'bookshelf-tall', 1, 15), put('furniture-2x2', 'planter', 10, 15),
  small('monstera', 1, 26), small('plant-tall', 12, 26), put('furniture-2x1', 'aquarium', 5, 15),
  // Copa: bancada, geladeira, máquinas e mesas redondas.
  put('furniture-3x2', 'kitchen-counter', 14, 15), put('furniture-2x2', 'fridge', 17, 15),
  put('furniture-2x2', 'vending-machine', 22, 15), small('coffee-machine', 19, 14), small('water-cooler', 20, 14),
  put('furniture-2x2', 'meeting-table-round', 14, 20), put('furniture-2x2', 'meeting-table-round', 19, 20),
  small('bar-stool', 15, 24), small('bar-stool', 17, 24), small('bar-stool', 19, 24), small('bar-stool', 21, 24),
  small('flowers', 23, 26), small('succulent', 13, 26), small('trash-bin', 24, 19),
  // Jogos: pingue-pongue, pebolim, fliperamas e pufes.
  put('furniture-3x2', 'ping-pong', 29, 17), put('furniture-3x2', 'foosball', 33, 17),
  put('furniture-2x2', 'arcade', 25, 15), put('furniture-2x2', 'arcade', 37, 15),
  small('beanbag-yellow', 28, 19), small('beanbag-blue', 36, 19), small('plant', 26, 19),
  // Jardim: árvores, bancos, vasos grandes e flores.
  put('furniture-2x2', 'tree', 25, 22), put('furniture-2x2', 'tree', 37, 22), put('furniture-2x2', 'tree', 31, 26),
  put('furniture-2x1', 'bench', 28, 22), put('furniture-2x1', 'bench', 34, 22), small('flowers', 27, 26),
  small('flowers', 36, 26), small('cactus', 30, 26), small('succulent', 34, 26),
];

const zone = (key: string, type: string, name: string, x: number, y: number, w: number, h: number) =>
  obj({ x: x * T, y: y * T, width: w * T, height: h * T, properties: props({ zone_key: key, type, name }) });

const zones = [
  zone('produto', 'open', 'Product team', 1, 2, 12, 10),
  zone('engenharia', 'open', 'Engineering', 13, 2, 13, 10),
  zone('sala-aurora', 'meeting', 'Sala Aurora', 27, 2, 12, 9),
  zone('lounge', 'open', 'Lounge', 1, 14, 12, 13),
  zone('copa', 'open', 'Copa', 13, 14, 12, 13),
  zone('jogos', 'open', 'Jogos', 25, 14, 14, 7),
  zone('jardim', 'open', 'Jardim', 25, 21, 14, 6),
];

// Mesas largas (32x16) viradas para baixo: cadeira na frente do tile da esquerda.
let deskCount = 0;
const desk = (x: number, y: number) =>
  obj({ x: x * T, y: y * T, width: 2 * T, height: T, properties: props({ desk_key: `mesa-${++deskCount}`, orientation: 'down' }) });
const desks = [
  desk(2, 4), desk(5, 4), desk(8, 4), desk(2, 8), desk(5, 8), desk(8, 8),
  desk(15, 4), desk(18, 4), desk(21, 4), desk(15, 8), desk(18, 8), desk(21, 8),
];

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: W,
  height: H,
  tilewidth: T,
  tileheight: T,
  nextlayerid: 7,
  nextobjectid: nextId,
  // Contadores do editor: chaves novas continuam depois das do modelo.
  properties: [
    { name: 'pixelwork_next_desk', type: 'string', value: String(deskCount + 1) },
    { name: 'pixelwork_next_zone', type: 'string', value: '1' },
  ],
  tilesets: Object.entries(FIRSTGID).map(([id, firstgid]) => ({ firstgid, source: `${id}.tsj` })),
  layers: [
    { id: 1, name: 'floor', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: floor },
    { id: 2, name: 'walls', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: walls },
    { id: 3, name: 'furniture', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: furniture },
    { id: 4, name: 'zones', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: zones },
    { id: 5, name: 'desks', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: desks },
    {
      id: 6,
      name: 'spawn',
      type: 'objectgroup',
      draworder: 'topdown',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      // No corredor, com espaço livre dos dois lados (o E2E anda a partir daqui).
      objects: [obj({ x: 20 * T + T / 2, y: 12 * T + T / 2, point: true })],
    },
  ],
};

const result = compileMap(map);
if (!result.ok) {
  console.error(result.errors);
  process.exit(1);
}
const out = join(import.meta.dirname, '../maps/templates/small-office.json');
writeFileSync(out, `${JSON.stringify(map)}\n`);
console.log('mapa gerado em maps/templates/small-office.json');
