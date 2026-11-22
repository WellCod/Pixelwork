// Gera toda a arte do repositório (docs/art.md, seção 10): tilesets (.png e .tsj) e camadas
// do personagem. Sobrescreve os arquivos; asset desenhado à mão sai daqui antes de entrar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { CHARACTER_SHEETS } from './art/character.ts';
import { FURNITURE_2X1, FURNITURE_2X2, FURNITURE_3X2 } from './art/furniture-large.ts';
import { DESK_DECOR, FLOORS, FURNITURE, WALLS, type TileArt } from './art/tiles.ts';
import { blank, stamp, toPng } from './lib/pixels.ts';

const root = join(import.meta.dirname, '..');
const assets = join(root, 'assets');
const TILE = 16;
// Largura fixa: os mapas referenciam tiles pela posição, então o número de colunas nunca muda.
const COLUMNS = 8;

function write(path: string, content: Buffer | string): void {
  const full = join(assets, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  console.log(`gerado ${relative(root, full)}`);
}

/** Célula de 16 px por padrão; móveis de várias células usam um tileset próprio com célula maior. */
function tileset(id: string, tiles: TileArt[], cell: { w: number; h: number } = { w: TILE, h: TILE }): void {
  const rows = Math.max(1, Math.ceil(tiles.length / COLUMNS));
  const sheet = blank(COLUMNS * cell.w, rows * cell.h);
  tiles.forEach((tile, i) => {
    const h = tile.pixels.length;
    const w = tile.pixels[0]?.length ?? 0;
    if (w !== cell.w || h !== cell.h) throw new Error(`${id}[${i}]: ${w}x${h}, esperado ${cell.w}x${cell.h}`);
    stamp(sheet, tile.pixels, (i % COLUMNS) * cell.w, Math.floor(i / COLUMNS) * cell.h);
  });
  write(`tilesets/${id}.png`, PNG.sync.write(toPng(sheet)));

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
    imagewidth: COLUMNS * cell.w,
    imageheight: rows * cell.h,
    tilewidth: cell.w,
    tileheight: cell.h,
    columns: COLUMNS,
    tilecount: COLUMNS * rows,
    margin: 0,
    spacing: 0,
    tiles: properties,
  };
  write(`tilesets/${id}.tsj`, `${JSON.stringify(tsj, null, 2)}\n`);
}

tileset('floors', FLOORS);
tileset('walls', WALLS);
tileset('furniture', FURNITURE);
tileset('desk-decor', DESK_DECOR);
tileset('furniture-2x1', FURNITURE_2X1, { w: 32, h: 16 });
tileset('furniture-2x2', FURNITURE_2X2, { w: 32, h: 32 });
tileset('furniture-3x2', FURNITURE_3X2, { w: 48, h: 32 });

for (const [path, pixels] of Object.entries(CHARACTER_SHEETS)) {
  write(`characters/${path}.png`, PNG.sync.write(toPng(pixels)));
}
