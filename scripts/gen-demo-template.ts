// Gera maps/templates/small-office.json, o mapa do coworking de demonstração (redesenho visual de
// 2026-11): escritório claro com área de produto e de engenharia (mesas largas), sala de reunião,
// lounge, copa, área de jogos e jardim. Depois de editado no Tiled, o JSON passa a ser a fonte e
// este script não deve mais rodar.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TILESETS, compileMap, type TilesetId } from '@pixelwork/shared';
import { RUGS, deskGroupLayout, rugMask, type RugId } from '@pixelwork/shared/editor';
// FIRSTGID reserva 100 gids por tileset (1, 101, 201...): um tileset pode crescer sem empurrar o
// gid dos seguintes, que os mapas salvos guardam.
import { FIRSTGID } from '@pixelwork/shared/testing';

// Tamanho do mapa em tiles e da célula em pixels.
const MAP_WIDTH = 40;
const MAP_HEIGHT = 28;
const TILE = 16;

// Pisos e paredes pelos frames dos tilesets (scripts/art/surfaces.ts).
const FLOOR = { woodLight: 0, kitchen: 2, cream: 3, gray: 4, grass: 55, stone: 56, sageTile: 58 };
const WALL = {
  top: 0, face: 1, window: 2, sage: 3, cream: 4, painting: 5, poster: 6, clock: 7, whiteboard: 8, shelf: 9,
  cork: 11, hangingPlant: 12, tv: 13, curtain: 14, divider: 15,
};

// Camadas de tile como arrays lineares (linha * largura + coluna) de gids globais; 0 é vazio.
const floor = new Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(FIRSTGID.floors + FLOOR.woodLight);
const walls = new Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(0);
const cellIndex = (x: number, y: number) => y * MAP_WIDTH + x;
const paint = (layer: number[], x0: number, y0: number, widthTiles: number, heightTiles: number, gid: number) => {
  for (let y = y0; y < y0 + heightTiles; y++) for (let x = x0; x < x0 + widthTiles; x++) layer[cellIndex(x, y)] = gid;
};
const floorRect = (frame: number, x: number, y: number, widthTiles: number, heightTiles: number) =>
  paint(floor, x, y, widthTiles, heightTiles, FIRSTGID.floors + frame);
const wall = (frame: number, x: number, y: number) => (walls[cellIndex(x, y)] = FIRSTGID.walls + frame);
/** Tapete: cada célula usa o frame de borda certo, somando a máscara N/S/O/L ao primeiro frame do tapete. */
const rug = (id: RugId, x0: number, y0: number, widthTiles: number, heightTiles: number) => {
  for (let y = 0; y < heightTiles; y++) {
    for (let x = 0; x < widthTiles; x++) {
      floor[cellIndex(x0 + x, y0 + y)] = FIRSTGID.floors + RUGS[id].firstFrame + rugMask(x, y, widthTiles, heightTiles);
    }
  }
};

// ---- pisos por área ----
floorRect(FLOOR.woodLight, 1, 2, 12, 10); // produto
floorRect(FLOOR.gray, 13, 2, 13, 10); // engenharia
floorRect(FLOOR.woodLight, 27, 2, 12, 9); // sala de reunião
floorRect(FLOOR.woodLight, 1, 12, 38, 2); // corredor contínuo com as áreas de madeira
floorRect(FLOOR.cream, 1, 14, 12, 13); // lounge
floorRect(FLOOR.kitchen, 13, 14, 12, 13); // copa
floorRect(FLOOR.sageTile, 25, 14, 14, 7); // jogos
floorRect(FLOOR.grass, 25, 21, 14, 6); // jardim
floorRect(FLOOR.stone, 25, 23, 14, 1);
rug('lavender', 2, 17, 8, 6);
rug('sage', 28, 15, 9, 5);
rug('cream', 29, 4, 8, 5);

// ---- paredes: topo em volta, face clara no alto com janelas e decoração ----
for (let x = 0; x < MAP_WIDTH; x++) {
  wall(WALL.top, x, 0);
  wall(WALL.top, x, MAP_HEIGHT - 1);
}
for (let y = 0; y < MAP_HEIGHT; y++) {
  wall(WALL.top, 0, y);
  wall(WALL.top, MAP_WIDTH - 1, y);
}
// Linha 1 inteira: [coluna, frame da parede].
const faceRow: [number, number][] = [
  [1, WALL.face], [2, WALL.window], [3, WALL.face], [4, WALL.painting], [5, WALL.window], [6, WALL.face],
  [7, WALL.clock], [8, WALL.window], [9, WALL.face], [10, WALL.poster], [11, WALL.window], [12, WALL.face],
  [13, WALL.cork], [14, WALL.window], [15, WALL.face], [16, WALL.whiteboard], [17, WALL.whiteboard], [18, WALL.face],
  [19, WALL.window], [20, WALL.shelf], [21, WALL.window], [22, WALL.face], [23, WALL.hangingPlant], [24, WALL.window],
  [25, WALL.face], [26, WALL.divider], [27, WALL.cream], [28, WALL.curtain], [29, WALL.cream], [30, WALL.cream],
  [31, WALL.cream], [32, WALL.tv], [33, WALL.cream], [34, WALL.cream], [35, WALL.cream], [36, WALL.cream],
  [37, WALL.curtain], [38, WALL.cream],
];
for (const [x, frame] of faceRow) wall(frame, x, 1);
// Aurora: divisória com Engenharia e frente creme, mantendo o vão da porta dupla.
for (let y = 2; y <= 11; y++) wall(WALL.divider, 26, y);
for (let x = 27; x < MAP_WIDTH - 1; x++) if (x !== 31 && x !== 32) wall(WALL.cream, x, 11);

// ---- objetos ----
// Ids sequenciais em todas as camadas de objeto; o último vira o `nextobjectid` do mapa.
let nextId = 1;
/** Objeto do Tiled com os campos padrão; a ordem das chaves define o JSON gerado. */
const tiledObject = (fields: Record<string, unknown>) => ({
  id: nextId++,
  name: '',
  type: '',
  rotation: 0,
  visible: true,
  width: 0,
  height: 0,
  ...fields,
});
const stringProperties = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, type: 'string', value }));

/** Frame do item no tileset, pelo item_id do catálogo. */
function frameOf(tileset: TilesetId, itemId: string): number {
  const entry = Object.entries(TILESETS[tileset].items).find(([, entryItemId]) => entryItemId === itemId);
  if (!entry) throw new Error(`${tileset} sem o item ${itemId}`);
  return Number(entry[0]);
}

/**
 * Móvel com âncora no tile de baixo à esquerda (x, y). Objeto de tile do Tiled tem o y na base,
 * por isso `(y + 1) * TILE`.
 */
const place = (tileset: TilesetId, itemId: string, x: number, y: number) => {
  const { tileWidth, tileHeight } = TILESETS[tileset];
  return tiledObject({
    gid: FIRSTGID[tileset] + frameOf(tileset, itemId),
    x: x * TILE,
    y: (y + 1) * TILE,
    width: tileWidth,
    height: tileHeight,
  });
};
const small = (itemId: string, x: number, y: number) => place('furniture', itemId, x, y);

const furniture = [
  // Produto e engenharia: plantas nos cantos, estantes e lousa.
  small('monstera', 1, 2), small('plant-tall', 12, 2), small('snake-plant', 1, 11), small('ficus', 12, 11),
  place('furniture-2x2', 'bookshelf-tall', 13, 3), small('printer', 13, 6), small('trash-bin', 13, 10),
  small('plant', 25, 2), small('cactus', 25, 11), place('furniture-2x2', 'whiteboard', 23, 11 - 1), small('flowers', 14, 11),
  // Sala de reunião: mesa comprida sobre o tapete, lousa e plantas.
  place('furniture-3x2', 'meeting-table-long', 31, 7), small('plant-tall', 27, 2), small('plant-tall', 38, 2),
  small('floor-lamp', 27, 10), small('ficus', 38, 10), small('door', 31, 11), small('door', 32, 11),
  // Corredor.
  small('plant', 1, 12), small('plant', 38, 12), small('water-cooler', 24, 12),
  // Lounge: sofás no tapete, mesa de centro, pufes, estante e luzes.
  place('furniture-3x2', 'sofa-l', 3, 19), place('furniture-2x1', 'coffee-table', 4, 20),
  place('furniture-2x1', 'sofa-sage', 4, 22), small('armchair', 8, 20), small('side-table', 9, 18),
  small('beanbag-pink', 10, 21), small('beanbag-blue', 11, 23), small('floor-lamp', 2, 23),
  place('furniture-2x2', 'bookshelf-tall', 1, 15), place('furniture-2x2', 'planter', 10, 15),
  small('monstera', 1, 26), small('plant-tall', 12, 26), place('furniture-2x1', 'aquarium', 5, 15),
  // Copa: bancada, geladeira, máquinas e mesas redondas.
  place('furniture-3x2', 'kitchen-counter', 14, 15), place('furniture-2x2', 'fridge', 17, 15),
  place('furniture-2x2', 'vending-machine', 22, 15), small('coffee-machine', 19, 14), small('water-cooler', 20, 14),
  place('furniture-2x2', 'meeting-table-round', 14, 20), place('furniture-2x2', 'meeting-table-round', 19, 20),
  small('bar-stool', 15, 24), small('bar-stool', 17, 24), small('bar-stool', 19, 24), small('bar-stool', 21, 24),
  small('flowers', 23, 26), small('succulent', 13, 26), small('trash-bin', 24, 19),
  // Jogos: pingue-pongue, pebolim, fliperamas e pufes.
  place('furniture-3x2', 'ping-pong', 29, 17), place('furniture-3x2', 'foosball', 33, 17),
  place('furniture-2x2', 'arcade', 25, 15), place('furniture-2x2', 'arcade', 37, 15),
  small('beanbag-yellow', 28, 19), small('beanbag-blue', 36, 19), small('plant', 26, 19),
  // Jardim: árvores, bancos, vasos grandes e flores.
  place('furniture-2x2', 'tree', 25, 22), place('furniture-2x2', 'tree', 37, 22), place('furniture-2x2', 'tree', 31, 26),
  place('furniture-2x1', 'bench', 28, 22), place('furniture-2x1', 'bench', 34, 22), small('flowers', 27, 26),
  small('flowers', 36, 26), small('cactus', 30, 26), small('succulent', 34, 26),
];

/** Retângulo de zona em tiles, convertido para pixels, com a chave estável e o tipo (open ou meeting). */
const zone = (
  zoneKey: string,
  type: string,
  name: string,
  x: number,
  y: number,
  widthTiles: number,
  heightTiles: number,
) =>
  tiledObject({
    x: x * TILE,
    y: y * TILE,
    width: widthTiles * TILE,
    height: heightTiles * TILE,
    properties: stringProperties({ zone_key: zoneKey, type, name }),
  });

const zones = [
  zone('produto', 'open', 'Product team', 1, 2, 12, 10),
  zone('engenharia', 'open', 'Engineering', 13, 2, 13, 10),
  zone('sala-aurora', 'meeting', 'Sala Aurora', 27, 2, 12, 9),
  zone('lounge', 'open', 'Lounge', 1, 14, 12, 13),
  zone('copa', 'open', 'Copa', 13, 14, 12, 13),
  zone('jogos', 'open', 'Jogos', 25, 14, 14, 7),
  zone('jardim', 'open', 'Jardim', 25, 21, 14, 6),
];

// O Produto usa mesas individuais; a Engenharia tem duas fileiras com as cadeiras para fora.
let deskCount = 0;
const desk = (x: number, y: number, orientation: 'up' | 'down' = 'down') =>
  tiledObject({
    x: x * TILE,
    y: y * TILE,
    width: 2 * TILE,
    height: TILE,
    properties: stringProperties({ desk_key: `mesa-${++deskCount}`, orientation }),
  });
const desks = [
  desk(2, 4), desk(5, 4), desk(8, 4), desk(2, 8), desk(5, 8), desk(8, 8),
  ...deskGroupLayout(16, 6, 'down', 'spine', 3).map(({ x, y, orientation }) =>
    desk(x, y, orientation === 'up' ? 'up' : 'down'),
  ),
];

const map = {
  type: 'map',
  version: '1.10',
  tiledversion: '1.11.0',
  orientation: 'orthogonal',
  renderorder: 'right-down',
  infinite: false,
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tilewidth: TILE,
  tileheight: TILE,
  nextlayerid: 7,
  nextobjectid: nextId,
  // Contadores do editor: chaves novas continuam depois das do modelo.
  properties: [
    { name: 'pixelwork_next_desk', type: 'string', value: String(deskCount + 1) },
    { name: 'pixelwork_next_zone', type: 'string', value: '1' },
  ],
  tilesets: Object.entries(FIRSTGID)
    .filter(([id]) => id !== 'desk-decor-extras' && id !== 'furniture-2x3' && !id.endsWith('-halloween'))
    .map(([id, firstgid]) => ({ firstgid, source: `${id}.tsj` })),
  layers: [
    { id: 1, name: 'floor', type: 'tilelayer', width: MAP_WIDTH, height: MAP_HEIGHT, x: 0, y: 0, opacity: 1, visible: true, data: floor },
    { id: 2, name: 'walls', type: 'tilelayer', width: MAP_WIDTH, height: MAP_HEIGHT, x: 0, y: 0, opacity: 1, visible: true, data: walls },
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
      objects: [tiledObject({ x: 20 * TILE + TILE / 2, y: 12 * TILE + TILE / 2, point: true })],
    },
  ],
};

// Valida com o `compileMap` do shared antes de gravar: mapa inválido não chega ao repositório.
const compiled = compileMap(map);
if (!compiled.ok) {
  console.error(compiled.errors);
  process.exit(1);
}
const outputPath = join(import.meta.dirname, '../maps/templates/small-office.json');
writeFileSync(outputPath, `${JSON.stringify(map)}\n`);
console.log('mapa gerado em maps/templates/small-office.json');
