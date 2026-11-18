// Folha de revisão da arte: tilesets e personagens compostos com a troca de paleta, ampliados.
// `pnpm tsx scripts/art-preview.ts <saida.png>`. Não vai para o repositório de assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const out = process.argv[2] ?? 'art-preview.png';
const SCALE = 4;
const read = (path: string) => PNG.sync.read(readFileSync(join(root, 'assets', path)));
const ramps = (kind: string) => JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;

const canvas = new PNG({ width: 128 * SCALE + 24 + 3 * (64 * SCALE + 16), height: 160 * SCALE + 16 });
for (let i = 0; i < canvas.data.length; i += 4) canvas.data.set([0x3a, 0x44, 0x66, 255], i);

function blit(src: PNG, dx: number, dy: number, swap?: Map<string, number[]>, sx = 0, sy = 0, w = src.width, h = src.height): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((sy + y) * src.width + sx + x) * 4;
      if ((src.data[i + 3] ?? 0) === 0) continue;
      let rgb = [src.data[i] ?? 0, src.data[i + 1] ?? 0, src.data[i + 2] ?? 0];
      const key = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
      rgb = swap?.get(key) ?? rgb;
      for (let yy = 0; yy < SCALE; yy++) {
        for (let xx = 0; xx < SCALE; xx++) {
          const o = ((dy + y * SCALE + yy) * canvas.width + dx + x * SCALE + xx) * 4;
          if (o >= 0 && o < canvas.data.length) canvas.data.set([...rgb, 255], o);
        }
      }
    }
  }
}

let y = 8;
for (const id of ['floors', 'walls', 'furniture', 'desk-decor']) {
  const sheet = read(`tilesets/${id}.png`);
  blit(sheet, 8, y);
  y += sheet.height * SCALE + 8;
}

function swapFor(skin: string, hair: string, outfit: string): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const pairs: [readonly string[], string[]][] = [
    [KEY_RAMPS.skin, ramps('skin')[skin] ?? []],
    [KEY_RAMPS.hair, ramps('hair')[hair] ?? []],
    [KEY_RAMPS.outfit, ramps('outfit')[outfit] ?? []],
  ];
  for (const [keys, colors] of pairs) {
    keys.forEach((k, i) => {
      const c = colors[i];
      if (c) map.set(k, [1, 3, 5].map((j) => parseInt(c.slice(j, j + 2), 16)));
    });
  }
  return map;
}

const looks = [
  { layers: ['body/base', 'outfit/basic', 'hair/short'], skin: 'light', hair: 'brown', outfit: 'blue' },
  { layers: ['body/base', 'outfit/hoodie', 'hair/long', 'accessory/glasses'], skin: 'medium', hair: 'blond', outfit: 'red' },
  { layers: ['body/base', 'outfit/basic', 'hair/spiky', 'accessory/cap'], skin: 'dark', hair: 'black', outfit: 'green' },
];
looks.forEach((look, i) => {
  const swap = swapFor(look.skin, look.hair, look.outfit);
  const x = 128 * SCALE + 24 + i * (64 * SCALE + 16);
  for (const layer of look.layers) blit(read(`characters/${layer}.png`), x, 8, swap);
});
writeFileSync(out, PNG.sync.write(canvas));
console.log(`prévia em ${out}`);
