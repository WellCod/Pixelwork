// Gera toda a arte do repositório (docs/art.md, seção 10): tilesets (.png e .tsj) e camadas
// do personagem. Sobrescreve os arquivos; asset desenhado à mão sai daqui antes de entrar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { CHARACTER_SHEETS } from './art/character.ts';
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

function tileset(id: string, tiles: TileArt[]): void {
  const rows = Math.max(1, Math.ceil(tiles.length / COLUMNS));
  const sheet = blank(COLUMNS * TILE, rows * TILE);
  tiles.forEach((tile, i) => stamp(sheet, tile.pixels, (i % COLUMNS) * TILE, Math.floor(i / COLUMNS) * TILE));
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
    imagewidth: COLUMNS * TILE,
    imageheight: rows * TILE,
    tilewidth: TILE,
    tileheight: TILE,
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

for (const [path, pixels] of Object.entries(CHARACTER_SHEETS)) {
  write(`characters/${path}.png`, PNG.sync.write(toPng(pixels)));
}
