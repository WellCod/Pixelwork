// Desenha um mapa salvo (JSON do Tiled) em PNG: pisos, paredes, móveis com sombra e mesas com
// monitor. Para revisar mapas e gerar prints sem abrir o app.
// `pnpm tsx scripts/render-map.ts [mapa.json] [saida.png] [escala]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { CONTACT_SHADOW_COLOR, deskContactShadows, furnitureContactShadows, isCornerSofa, type ContactShadow } from '@pixelwork/shared';

const root = join(import.meta.dirname, '..');
const [mapPath = join(root, 'maps/templates/small-office.json'), outputPath = 'map.png', scaleArg = '2'] =
  process.argv.slice(2);
const SCALE = Number(scaleArg);
const TILE = 16;
// Os 4 bits altos do gid do Tiled são as flags de espelhamento e rotação; o resto é o gid de fato.
const GID_MASK = 0x0fffffff;

interface TilesetRef {
  firstgid: number;
  source: string;
}
interface MapObject {
  gid?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: { name: string; value: unknown }[];
}
interface Layer {
  name: string;
  data?: number[];
  objects?: MapObject[];
}
interface Sheet {
  png: PNG;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  /** item_id -> índice do tile, para achar o frame da mesa e do monitor pelo nome. */
  items: Map<string, number>;
  itemIds: Map<number, string>;
  collides: Set<number>;
}
const map = JSON.parse(readFileSync(mapPath, 'utf8')) as {
  width: number;
  height: number;
  tilesets: TilesetRef[];
  layers: Layer[];
};
const sheetCache = new Map<string, Sheet>();

/** PNG e metadados do tileset, lidos de assets/tilesets na primeira vez e guardados. */
function loadSheet(id: string): Sheet {
  let sheet = sheetCache.get(id);
  if (!sheet) {
    const tsj = JSON.parse(readFileSync(join(root, 'assets/tilesets', `${id}.tsj`), 'utf8')) as {
      tilewidth: number;
      tileheight: number;
      columns: number;
      tiles?: { id: number; properties?: { name: string; value: unknown }[] }[];
    };
    const items = new Map<string, number>();
    const itemIds = new Map<number, string>();
    const collides = new Set<number>();
    for (const tile of tsj.tiles ?? []) {
      const itemId = tile.properties?.find((property) => property.name === 'item_id')?.value;
      if (typeof itemId === 'string') {
        items.set(itemId, tile.id);
        itemIds.set(tile.id, itemId);
      }
      if (tile.properties?.some((property) => property.name === 'collides' && property.value === true)) collides.add(tile.id);
    }
    sheet = {
      png: PNG.sync.read(readFileSync(join(root, 'assets/tilesets', `${id}.png`))),
      tileWidth: tsj.tilewidth,
      tileHeight: tsj.tileheight,
      columns: tsj.columns,
      items,
      itemIds,
      collides,
    };
    sheetCache.set(id, sheet);
  }
  return sheet;
}

/**
 * Gid global -> (tileset, frame). O tileset é o de maior `firstgid` que não passa do gid, como no
 * Tiled; o frame é a distância até esse `firstgid`. Gid 0 é célula vazia.
 */
function resolve(gid: number): { id: string; frame: number } | null {
  const cleanGid = gid & GID_MASK;
  if (cleanGid === 0) return null;
  const tilesetRef = [...map.tilesets]
    .filter((ref) => ref.firstgid <= cleanGid)
    .sort((refA, refB) => refB.firstgid - refA.firstgid)[0];
  return tilesetRef ? { id: tilesetRef.source.replace(/\.tsj$/, ''), frame: cleanGid - tilesetRef.firstgid } : null;
}

const canvas = new PNG({ width: map.width * TILE, height: map.height * TILE });

/** Pinta um pixel misturando com o que já está lá pelo `alpha` (1 cobre, abaixo disso é sombra). */
function put(x: number, y: number, rgb: number[], alpha = 1): void {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const offset = (y * canvas.width + x) * 4;
  for (let channel = 0; channel < 3; channel++) {
    canvas.data[offset + channel] = Math.round(
      (canvas.data[offset + channel] ?? 0) * (1 - alpha) + (rgb[channel] ?? 0) * alpha,
    );
  }
  canvas.data[offset + 3] = 255;
}

/** Frame `frame` do tileset `id` com o canto inferior esquerdo em (x, bottom). */
function draw(id: string, frame: number, x: number, bottom: number, rows?: readonly [number, number]): void {
  const sheet = loadSheet(id);
  const sourceX = (frame % sheet.columns) * sheet.tileWidth;
  const sourceY = Math.floor(frame / sheet.columns) * sheet.tileHeight;
  const [firstRow, endRow] = rows ?? [0, sheet.tileHeight];
  for (let dy = firstRow; dy < endRow; dy++) {
    for (let dx = 0; dx < sheet.tileWidth; dx++) {
      const sourceOffset = ((sourceY + dy) * sheet.png.width + sourceX + dx) * 4;
      if ((sheet.png.data[sourceOffset + 3] ?? 0) === 0) continue;
      put(x + dx, bottom - sheet.tileHeight + dy, [
        sheet.png.data[sourceOffset] ?? 0,
        sheet.png.data[sourceOffset + 1] ?? 0,
        sheet.png.data[sourceOffset + 2] ?? 0,
      ]);
    }
  }
}

const shadowRgb = [CONTACT_SHADOW_COLOR >> 16, (CONTACT_SHADOW_COLOR >> 8) & 255, CONTACT_SHADOW_COLOR & 255];

function paintContactShadows(anchorX: number, bottom: number, shadows: readonly ContactShadow[]): void {
  for (const shadow of shadows) {
    const centerX = anchorX + shadow.centerX;
    const centerY = bottom + shadow.centerY;
    const radiusX = shadow.width / 2;
    const radiusY = shadow.height / 2;
    for (let y = Math.floor(centerY - radiusY); y <= centerY + radiusY; y++) {
      for (let x = Math.floor(centerX - radiusX); x <= centerX + radiusX; x++) {
        if (((x + 0.5 - centerX) / radiusX) ** 2 + ((y + 0.5 - centerY) / radiusY) ** 2 <= 1) {
          put(x, y, shadowRgb, shadow.alpha);
        }
      }
    }
  }
}

const findLayer = (name: string) => map.layers.find((layer) => layer.name === name);
// Camadas de tile: o índice no array é linha * largura + coluna, e `draw` ancora pela base da célula.
function paintLayer(name: 'floor' | 'walls'): void {
  (findLayer(name)?.data ?? []).forEach((gid, i) => {
    const tile = resolve(gid);
    if (tile) draw(tile.id, tile.frame, (i % map.width) * TILE, (Math.floor(i / map.width) + 1) * TILE);
  });
}

paintLayer('floor');

// Móveis e mesas vão para uma lista só e são pintados pela base (y de baixo), para o que está mais
// embaixo no mapa cobrir o que está atrás, como no cliente.
const drawables: { base: number; paint: () => void }[] = [];
for (const furnitureObject of findLayer('furniture')?.objects ?? []) {
  const tile = furnitureObject.gid ? resolve(furnitureObject.gid) : null;
  if (!tile) continue;
  const { tileWidth, tileHeight, itemIds, collides } = loadSheet(tile.id);
  const item = itemIds.get(tile.frame);
  if (collides.has(tile.frame)) {
    paintContactShadows(furnitureObject.x, furnitureObject.y, furnitureContactShadows(item, tileWidth, tileHeight));
  }
  const drawObject = (rows?: readonly [number, number]) => draw(tile.id, tile.frame, furnitureObject.x, furnitureObject.y, rows);
  if (isCornerSofa(item, tileWidth, tileHeight)) {
    drawables.push({ base: furnitureObject.y - TILE, paint: () => drawObject([0, TILE]) });
    drawables.push({ base: furnitureObject.y, paint: () => drawObject([TILE, tileHeight]) });
  } else {
    drawables.push({ base: furnitureObject.y, paint: () => drawObject() });
  }
}
const decorItems = loadSheet('desk-decor').items;
for (const deskObject of findLayer('desks')?.objects ?? []) {
  const isWide = deskObject.width > TILE;
  const isTall = deskObject.height > TILE;
  // Mesa é objeto retangular: o y fica no topo, então a base é y + altura.
  const bottom = deskObject.y + deskObject.height;
  paintContactShadows(deskObject.x, bottom, deskContactShadows(deskObject.width, deskObject.height));
  drawables.push({
    base: bottom,
    paint: () => {
      const frameOf = (itemId: string) => decorItems.get(itemId) ?? 0;
      if (isWide) {
        draw('desk-decor', frameOf('basic-wide-l'), deskObject.x, bottom);
        draw('desk-decor', frameOf('basic-wide-r'), deskObject.x + TILE, bottom);
        draw('desk-decor', frameOf('monitor-single'), deskObject.x + 8, bottom - 2);
      } else if (isTall) {
        draw('desk-decor', frameOf('basic-tall-t'), deskObject.x, bottom - TILE);
        draw('desk-decor', frameOf('basic-tall-b'), deskObject.x, bottom);
        draw('desk-decor', frameOf('monitor-single'), deskObject.x, bottom - 17);
      } else {
        draw('desk-decor', frameOf('basic'), deskObject.x, bottom);
        draw('desk-decor', frameOf('monitor-single'), deskObject.x, bottom - 2);
      }
    },
  });
}
paintLayer('walls');
for (const drawable of drawables.sort((drawableA, drawableB) => drawableA.base - drawableB.base)) drawable.paint();

// Ampliação final por vizinho mais próximo: cada pixel da saída copia os 4 bytes do pixel de origem.
const scaled = new PNG({ width: canvas.width * SCALE, height: canvas.height * SCALE });
for (let y = 0; y < scaled.height; y++) {
  for (let x = 0; x < scaled.width; x++) {
    const sourceOffset = (Math.floor(y / SCALE) * canvas.width + Math.floor(x / SCALE)) * 4;
    scaled.data.set(canvas.data.subarray(sourceOffset, sourceOffset + 4), (y * scaled.width + x) * 4);
  }
}
writeFileSync(outputPath, PNG.sync.write(scaled));
console.log(`mapa em ${outputPath}`);
