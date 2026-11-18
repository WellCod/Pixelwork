// Gera PNGs e .tsj de placeholder no layout final (docs/art.md, seções 4, 5 e 10).
// Não sobrescreve arquivo existente, para não apagar arte final; use --force para regerar.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const assets = join(root, 'assets');
const force = process.argv.includes('--force');

const TILE = 16;
// Largura fixa: os mapas referenciam tiles pela posição, então o número de colunas nunca muda.
const TILESET_COLUMNS = 8;

const C = {
  outline: '#181425',
  white: '#ffffff',
  light: '#c0cbdc',
  mid: '#8b9bb4',
  slate: '#5a6988',
  navy: '#3a4466',
  wood: '#b86f50',
  woodDark: '#733e39',
  green: '#63c74d',
  greenDark: '#3e8948',
  red: '#a22633',
  blue: '#0099db',
  yellow: '#feae34',
} as const;

class Canvas {
  readonly png: PNG;
  constructor(width: number, height: number) {
    this.png = new PNG({ width, height });
    this.png.data.fill(0);
  }
  rect(x: number, y: number, w: number, h: number, hex: string): void {
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const i = (py * this.png.width + px) * 4;
        this.png.data[i] = rgb[0] ?? 0;
        this.png.data[i + 1] = rgb[1] ?? 0;
        this.png.data[i + 2] = rgb[2] ?? 0;
        this.png.data[i + 3] = 255;
      }
    }
  }
}

function write(path: string, content: Buffer | string): void {
  const full = join(assets, path);
  if (existsSync(full) && !force) {
    console.log(`mantido ${relative(root, full)}`);
    return;
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`gerado ${relative(root, full)}`);
}

interface TileDef {
  draw: (c: Canvas, x: number, y: number) => void;
  collides?: boolean;
  itemId?: string;
}

function tileset(id: string, tiles: TileDef[]): void {
  const rows = Math.max(1, Math.ceil(tiles.length / TILESET_COLUMNS));
  const canvas = new Canvas(TILESET_COLUMNS * TILE, rows * TILE);
  tiles.forEach((tile, i) => {
    tile.draw(canvas, (i % TILESET_COLUMNS) * TILE, Math.floor(i / TILESET_COLUMNS) * TILE);
  });
  write(`tilesets/${id}.png`, PNG.sync.write(canvas.png));

  const properties = tiles.flatMap((tile, i) => {
    const props = [
      ...(tile.collides ? [{ name: 'collides', type: 'bool', value: true }] : []),
      ...(tile.itemId ? [{ name: 'item_id', type: 'string', value: tile.itemId }] : []),
    ];
    return props.length > 0 ? [{ id: i, properties: props }] : [];
  });
  const tsj = {
    type: 'tileset',
    version: '1.10',
    name: id,
    image: `${id}.png`,
    imagewidth: canvas.png.width,
    imageheight: canvas.png.height,
    tilewidth: TILE,
    tileheight: TILE,
    columns: TILESET_COLUMNS,
    tilecount: TILESET_COLUMNS * rows,
    margin: 0,
    spacing: 0,
    tiles: properties,
  };
  write(`tilesets/${id}.tsj`, `${JSON.stringify(tsj, null, 2)}\n`);
}

const fill =
  (base: string, detail?: string): TileDef['draw'] =>
  (c, x, y) => {
    c.rect(x, y, TILE, TILE, base);
    if (detail) {
      for (let i = 0; i < TILE; i += 4) c.rect(x, y + i, TILE, 1, detail);
    }
  };

const object =
  (body: string, inset: number, accent?: string): TileDef['draw'] =>
  (c, x, y) => {
    c.rect(x + inset, y + inset, TILE - inset * 2, TILE - inset * 2, C.outline);
    c.rect(x + inset + 1, y + inset + 1, TILE - inset * 2 - 2, TILE - inset * 2 - 2, body);
    if (accent) c.rect(x + 6, y + 6, 4, 4, accent);
  };

tileset('floors', [
  { draw: fill(C.wood, C.woodDark) },
  { draw: fill(C.navy, C.slate) },
  {
    draw: (c, x, y) => {
      c.rect(x, y, TILE, TILE, C.white);
      c.rect(x, y, 8, 8, C.light);
      c.rect(x + 8, y + 8, 8, 8, C.light);
    },
  },
]);

tileset('walls', [
  { draw: fill(C.mid) },
  {
    draw: (c, x, y) => {
      c.rect(x, y, TILE, TILE, C.light);
      c.rect(x, y + 13, TILE, 3, C.slate);
    },
  },
]);

tileset('furniture', [
  { draw: object(C.wood, 1), collides: true, itemId: 'desk' },
  { draw: object(C.navy, 4), itemId: 'chair' },
  { draw: object(C.greenDark, 3, C.green), collides: true, itemId: 'plant' },
  { draw: object(C.red, 1), collides: true, itemId: 'sofa' },
  { draw: object(C.woodDark, 0), collides: true, itemId: 'meeting-table' },
  { draw: object(C.yellow, 2), itemId: 'door' },
]);

tileset('desk-decor', [
  { draw: object(C.wood, 0), collides: true, itemId: 'basic' },
  { draw: object(C.outline, 4, C.blue), itemId: 'monitor-single' },
  { draw: object(C.outline, 2, C.blue), itemId: 'monitor-dual' },
  { draw: object(C.slate, 4, C.light), itemId: 'monitor-laptop' },
  { draw: object(C.white, 6), itemId: 'mug' },
  { draw: object(C.yellow, 3, C.red), itemId: 'poster' },
  { draw: object(C.greenDark, 5, C.green), itemId: 'plant-small' },
]);

// Personagem: frame 16x32, 4 colunas x 5 linhas, mesma silhueta em todos os frames.
const FRAME_W = 16;
const FRAME_H = 32;
type Layer = (c: Canvas, x: number, y: number, row: number) => void;

function character(path: string, draw: Layer): void {
  const canvas = new Canvas(FRAME_W * 4, FRAME_H * 5);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) draw(canvas, col * FRAME_W, row * FRAME_H, row);
  }
  write(`characters/${path}.png`, PNG.sync.write(canvas.png));
}

const [skin0, skin1, skin2, skin3] = KEY_RAMPS.skin;
const [, hair1, hair2] = KEY_RAMPS.hair;
const [, outfit1, outfit2] = KEY_RAMPS.outfit;

character('body/base', (c, x, y, row) => {
  c.rect(x + 4, y + 8, 8, 9, skin0);
  c.rect(x + 5, y + 9, 6, 7, skin2);
  c.rect(x + 6, y + 10, 2, 2, skin3);
  c.rect(x + 4, y + 17, 8, 12, skin1);
  c.rect(x + 4, y + 29, 3, 3, C.outline);
  c.rect(x + 9, y + 29, 3, 3, C.outline);
  if (row !== 3) {
    c.rect(x + 6, y + 13, 1, 1, C.outline);
    c.rect(x + 9, y + 13, 1, 1, C.outline);
  }
});

character('outfit/basic', (c, x, y) => {
  c.rect(x + 4, y + 17, 8, 12, outfit1);
  c.rect(x + 5, y + 18, 6, 6, outfit2);
});

character('hair/short', (c, x, y) => {
  c.rect(x + 4, y + 7, 8, 3, hair1);
  c.rect(x + 5, y + 7, 6, 2, hair2);
});

character('accessory/glasses', (c, x, y, row) => {
  if (row !== 3) c.rect(x + 5, y + 13, 6, 1, C.outline);
});
