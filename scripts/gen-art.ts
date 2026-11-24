// Gera toda a arte do repositório (docs/art.md, seção 10): tilesets (.png e .tsj) e camadas
// do personagem. Sobrescreve os arquivos; asset desenhado à mão sai daqui antes de entrar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { CHARACTER_SHEETS } from './art/character.ts';
import { FURNITURE_2X1, FURNITURE_2X2, FURNITURE_2X3, FURNITURE_3X2 } from './art/furniture-large.ts';
import {
  DESK_DECOR, DESK_DECOR_CHRISTMAS, DESK_DECOR_EXTRAS, DESK_DECOR_FESTIVE, DESK_DECOR_GRINCH, DESK_DECOR_HALLOWEEN, FLOORS, FURNITURE, FURNITURE_2X1_HALLOWEEN,
  FURNITURE_2X2_CHRISTMAS, FURNITURE_CHRISTMAS, FURNITURE_HALLOWEEN, WALLS, type TileArt,
} from './art/tiles.ts';
import { blank, stamp, toPng } from './lib/pixels.ts';

const root = join(import.meta.dirname, '..');
const assetsDir = join(root, 'assets');
const TILE = 16;
// Largura fixa: os mapas referenciam tiles pela posição, então o número de colunas nunca muda.
const COLUMNS = 8;

/** Grava um arquivo relativo a `assets/`, criando a pasta, e registra o caminho no console. */
function write(path: string, content: Buffer | string): void {
  const fullPath = join(assetsDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  console.log(`gerado ${relative(root, fullPath)}`);
}

/**
 * Monta o PNG e o .tsj (formato do Tiled) de um tileset. Os tiles entram em ordem, da esquerda
 * para a direita e de cima para baixo, em `COLUMNS` colunas; o índice no array é o id do tile no
 * .tsj e a posição que os mapas salvam, por isso a lista só cresce no fim.
 * Célula de 16 px por padrão; móveis de várias células usam um tileset próprio com célula maior.
 */
function tileset(id: string, tiles: TileArt[], cell: { w: number; h: number } = { w: TILE, h: TILE }): void {
  const rowCount = Math.max(1, Math.ceil(tiles.length / COLUMNS));
  const sheet = blank(COLUMNS * cell.w, rowCount * cell.h);
  tiles.forEach((tile, i) => {
    const tileHeight = tile.pixels.length;
    const tileWidth = tile.pixels[0]?.length ?? 0;
    if (tileWidth !== cell.w || tileHeight !== cell.h) {
      throw new Error(`${id}[${i}]: ${tileWidth}x${tileHeight}, esperado ${cell.w}x${cell.h}`);
    }
    stamp(sheet, tile.pixels, (i % COLUMNS) * cell.w, Math.floor(i / COLUMNS) * cell.h);
  });
  write(`tilesets/${id}.png`, PNG.sync.write(toPng(sheet)));

  // O .tsj só lista os tiles que têm propriedade (colisão ou item da mesa); os demais ficam implícitos.
  const tilesWithProperties = tiles.flatMap((tile, i) => {
    const tileProperties = [
      ...(tile.collides ? [{ name: 'collides', type: 'bool', value: true }] : []),
      ...(tile.itemId ? [{ name: 'item_id', type: 'string', value: tile.itemId }] : []),
    ];
    return tileProperties.length > 0 ? [{ id: i, properties: tileProperties }] : [];
  });
  // `tilecount` conta a grade inteira, inclusive as células vazias da última linha.
  const tsj = {
    type: 'tileset',
    version: '1.10',
    name: id,
    image: `${id}.png`,
    imagewidth: COLUMNS * cell.w,
    imageheight: rowCount * cell.h,
    tilewidth: cell.w,
    tileheight: cell.h,
    columns: COLUMNS,
    tilecount: COLUMNS * rowCount,
    margin: 0,
    spacing: 0,
    tiles: tilesWithProperties,
  };
  write(`tilesets/${id}.tsj`, `${JSON.stringify(tsj, null, 2)}\n`);
}

tileset('floors', FLOORS);
tileset('walls', WALLS);
tileset('furniture', FURNITURE);
tileset('desk-decor', DESK_DECOR);
tileset('desk-decor-extras', DESK_DECOR_EXTRAS);
tileset('furniture-2x1', FURNITURE_2X1, { w: 32, h: 16 });
tileset('furniture-2x2', FURNITURE_2X2, { w: 32, h: 32 });
tileset('furniture-3x2', FURNITURE_3X2, { w: 48, h: 32 });
tileset('furniture-2x3', FURNITURE_2X3, { w: 32, h: 48 });
tileset('desk-decor-halloween', DESK_DECOR_HALLOWEEN);
tileset('desk-decor-festive', DESK_DECOR_FESTIVE);
tileset('desk-decor-grinch', DESK_DECOR_GRINCH);
tileset('desk-decor-christmas', DESK_DECOR_CHRISTMAS);
tileset('furniture-christmas', FURNITURE_CHRISTMAS);
tileset('furniture-2x2-christmas', FURNITURE_2X2_CHRISTMAS, { w: 32, h: 32 });
tileset('furniture-halloween', FURNITURE_HALLOWEEN);
tileset('furniture-2x1-halloween', FURNITURE_2X1_HALLOWEEN, { w: 32, h: 16 });

for (const [path, pixels] of Object.entries(CHARACTER_SHEETS)) {
  write(`characters/${path}.png`, PNG.sync.write(toPng(pixels)));
}
