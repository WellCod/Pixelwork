// Desenha um mapa salvo (JSON do Tiled) em PNG: pisos, paredes, móveis com sombra e mesas com
// monitor. Para revisar mapas e gerar prints sem abrir o app.
// `pnpm tsx scripts/render-map.ts [mapa.json] [saida.png] [escala]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const root = join(import.meta.dirname, '..');
const [mapPath = join(root, 'maps/templates/small-office.json'), out = 'map.png', scaleArg = '2'] = process.argv.slice(2);
const SCALE = Number(scaleArg);
const T = 16;
const GID_MASK = 0x0fffffff;

interface Ref {
  firstgid: number;
  source: string;
}
interface Obj {
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
  objects?: Obj[];
}
const map = JSON.parse(readFileSync(mapPath, 'utf8')) as { width: number; height: number; tilesets: Ref[]; layers: Layer[] };
const sheets = new Map<string, { png: PNG; w: number; h: number; columns: number; items: Map<string, number> }>();
function sheet(id: string) {
  let s = sheets.get(id);
  if (!s) {
    const tsj = JSON.parse(readFileSync(join(root, 'assets/tilesets', `${id}.tsj`), 'utf8')) as {
      tilewidth: number;
      tileheight: number;
      columns: number;
      tiles?: { id: number; properties?: { name: string; value: unknown }[] }[];
    };
    const items = new Map<string, number>();
    for (const tile of tsj.tiles ?? []) {
      const item = tile.properties?.find((p) => p.name === 'item_id')?.value;
      if (typeof item === 'string') items.set(item, tile.id);
    }
    s = { png: PNG.sync.read(readFileSync(join(root, 'assets/tilesets', `${id}.png`))), w: tsj.tilewidth, h: tsj.tileheight, columns: tsj.columns, items };
    sheets.set(id, s);
  }
  return s;
}
function resolve(gid: number): { id: string; frame: number } | null {
  const clean = gid & GID_MASK;
  if (clean === 0) return null;
  const ref = [...map.tilesets].filter((r) => r.firstgid <= clean).sort((a, b) => b.firstgid - a.firstgid)[0];
  return ref ? { id: ref.source.replace(/\.tsj$/, ''), frame: clean - ref.firstgid } : null;
}

const canvas = new PNG({ width: map.width * T, height: map.height * T });
function put(x: number, y: number, rgb: number[], alpha = 1): void {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
  const i = (y * canvas.width + x) * 4;
  for (let c = 0; c < 3; c++) canvas.data[i + c] = Math.round((canvas.data[i + c] ?? 0) * (1 - alpha) + (rgb[c] ?? 0) * alpha);
  canvas.data[i + 3] = 255;
}
/** Frame `frame` do tileset `id` com o canto inferior esquerdo em (x, bottom). */
function draw(id: string, frame: number, x: number, bottom: number): void {
  const s = sheet(id);
  const sx = (frame % s.columns) * s.w;
  const sy = Math.floor(frame / s.columns) * s.h;
  for (let yy = 0; yy < s.h; yy++) {
    for (let xx = 0; xx < s.w; xx++) {
      const i = ((sy + yy) * s.png.width + sx + xx) * 4;
      if ((s.png.data[i + 3] ?? 0) === 0) continue;
      put(x + xx, bottom - s.h + yy, [s.png.data[i] ?? 0, s.png.data[i + 1] ?? 0, s.png.data[i + 2] ?? 0]);
    }
  }
}
function shadow(cx: number, cy: number, rx: number, ry: number): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, [0x2e, 0x22, 0x2f], 0.18);
    }
  }
}

const layer = (name: string) => map.layers.find((l) => l.name === name);
for (const name of ['floor', 'walls']) {
  (layer(name)?.data ?? []).forEach((gid, i) => {
    const tile = resolve(gid);
    if (tile) draw(tile.id, tile.frame, (i % map.width) * T, (Math.floor(i / map.width) + 1) * T);
  });
}

const items: { base: number; paint: () => void }[] = [];
for (const o of layer('furniture')?.objects ?? []) {
  const tile = o.gid ? resolve(o.gid) : null;
  if (!tile) continue;
  items.push({
    base: o.y,
    paint: () => {
      shadow(o.x + o.width / 2, o.y - 2, o.width / 2 - 1, 3);
      draw(tile.id, tile.frame, o.x, o.y);
    },
  });
}
const decor = sheet('desk-decor').items;
for (const o of layer('desks')?.objects ?? []) {
  const wide = o.width > T;
  const tall = o.height > T;
  const bottom = o.y + o.height;
  items.push({
    base: bottom,
    paint: () => {
      shadow(o.x + o.width / 2, bottom - 2, o.width / 2 - 1, 3);
      const f = (item: string) => decor.get(item) ?? 0;
      if (wide) {
        draw('desk-decor', f('basic-wide-l'), o.x, bottom);
        draw('desk-decor', f('basic-wide-r'), o.x + T, bottom);
        draw('desk-decor', f('monitor-single'), o.x + 8, bottom - 2);
      } else if (tall) {
        draw('desk-decor', f('basic-tall-t'), o.x, bottom - T);
        draw('desk-decor', f('basic-tall-b'), o.x, bottom);
        draw('desk-decor', f('monitor-single'), o.x, bottom - 17);
      } else {
        draw('desk-decor', f('basic'), o.x, bottom);
        draw('desk-decor', f('monitor-single'), o.x, bottom - 2);
      }
    },
  });
}
for (const item of items.sort((a, b) => a.base - b.base)) item.paint();

const big = new PNG({ width: canvas.width * SCALE, height: canvas.height * SCALE });
for (let y = 0; y < big.height; y++) {
  for (let x = 0; x < big.width; x++) {
    const s = (Math.floor(y / SCALE) * canvas.width + Math.floor(x / SCALE)) * 4;
    big.data.set(canvas.data.subarray(s, s + 4), (y * big.width + x) * 4);
  }
}
writeFileSync(out, PNG.sync.write(big));
console.log(`mapa em ${out}`);
