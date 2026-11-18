// Gera maps/templates/small-office.json, o mapa do coworking de demonstração.
// Depois de editado no Tiled, o JSON passa a ser a fonte e este script não deve mais rodar.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileMap } from '@pixelwork/shared';
import { FIRSTGID } from '@pixelwork/shared/testing';

const W = 30;
const H = 20;
const T = 16;

const FLOOR = { wood: FIRSTGID.floors, carpet: FIRSTGID.floors + 1, kitchen: FIRSTGID.floors + 2 };
const WALL = FIRSTGID.walls + 1;
const F = { chair: 1, plant: 2, sofa: 3, table: 4, door: 5 };

const floor = new Array<number>(W * H).fill(FLOOR.wood);
const walls = new Array<number>(W * H).fill(0);
const set = (layer: number[], x: number, y: number, gid: number) => (layer[y * W + x] = gid);
const rect = (layer: number[], x0: number, y0: number, w: number, h: number, gid: number) => {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(layer, x, y, gid);
};

for (let x = 0; x < W; x++) {
  set(walls, x, 0, WALL);
  set(walls, x, H - 1, WALL);
}
for (let y = 0; y < H; y++) {
  set(walls, 0, y, WALL);
  set(walls, W - 1, y, WALL);
}
// Sala de reunião no canto superior direito, porta em (23, 8) e (24, 8).
for (let y = 1; y <= 8; y++) set(walls, 19, y, WALL);
for (let x = 19; x < W - 1; x++) if (x !== 23 && x !== 24) set(walls, x, 8, WALL);
rect(floor, 20, 1, 9, 7, FLOOR.carpet);
rect(floor, 1, 14, 8, 5, FLOOR.kitchen);

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
const tile = (tileIndex: number, x: number, y: number) =>
  obj({ gid: FIRSTGID.furniture + tileIndex, x: x * T, y: (y + 1) * T, width: T, height: T });

const furniture = [
  tile(F.table, 23, 3),
  tile(F.table, 24, 3),
  tile(F.table, 23, 4),
  tile(F.table, 24, 4),
  tile(F.chair, 22, 3),
  tile(F.chair, 22, 4),
  tile(F.chair, 25, 3),
  tile(F.chair, 25, 4),
  tile(F.plant, 20, 1),
  tile(F.plant, 28, 1),
  tile(F.plant, 1, 1),
  tile(F.plant, 18, 1),
  tile(F.plant, 9, 12),
  tile(F.sofa, 2, 17),
  tile(F.sofa, 3, 17),
  tile(F.sofa, 4, 17),
  tile(F.door, 23, 8),
  tile(F.door, 24, 8),
];

const zone = (key: string, type: string, name: string, x: number, y: number, w: number, h: number) =>
  obj({ x: x * T, y: y * T, width: w * T, height: h * T, properties: props({ zone_key: key, type, name }) });

const zones = [
  zone('produto', 'open', 'Product team', 1, 1, 9, 11),
  zone('engenharia', 'open', 'Engineering', 10, 1, 9, 11),
  zone('sala-aurora', 'meeting', 'Sala Aurora', 20, 1, 9, 7),
  zone('copa', 'open', 'Copa', 1, 14, 8, 5),
];

const desk = (key: string, x: number, y: number) =>
  obj({ x: x * T, y: y * T, width: T, height: T, properties: props({ desk_key: key, orientation: 'down' }) });

const desks = [desk('mesa-1', 3, 3), desk('mesa-2', 6, 3), desk('mesa-3', 12, 3), desk('mesa-4', 15, 3)];

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
      objects: [obj({ x: 14 * T + T / 2, y: 16 * T + T / 2, point: true })],
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
