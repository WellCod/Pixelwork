// Folha de revisão dos avatares: cada cabelo, roupa e acessório de frente, com as rampas trocadas,
// ampliada. `pnpm tsx scripts/art-avatars.ts [saida.png]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const out = process.argv[2] ?? 'art-avatars.png';
const SCALE = 5;
const manifest = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8')) as {
  characters: Record<'hair' | 'outfit' | 'accessory', { id: string }[]>;
};
const ramps = (kind: string) =>
  JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;
const layer = (path: string) => PNG.sync.read(readFileSync(join(root, 'assets/characters', `${path}.png`)));
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

const skins = Object.keys(ramps('skin'));
const hairColors = Object.keys(ramps('hair'));
const outfitColors = Object.keys(ramps('outfit'));

interface Avatar {
  hair: string;
  outfit: string;
  accessory: string | null;
  i: number;
}
const hairs = manifest.characters.hair.map((h) => h.id);
const outfits = manifest.characters.outfit.map((o) => o.id);
const accessories = [null, ...manifest.characters.accessory.map((a) => a.id)];
const count = Math.max(hairs.length, outfits.length, accessories.length);
const avatars: Avatar[] = Array.from({ length: count }, (_, i) => ({
  hair: hairs[i % hairs.length] ?? 'short',
  outfit: outfits[i % outfits.length] ?? 'basic',
  accessory: accessories[i % accessories.length] ?? null,
  i,
}));

const W = 20;
const canvas = new PNG({ width: avatars.length * W * SCALE, height: 36 * SCALE });
for (let i = 0; i < canvas.data.length; i += 4) canvas.data.set([0xfd, 0xcb, 0xb0, 255], i);

for (const a of avatars) {
  const swap = new Map<string, number[]>();
  const pick = (kind: 'skin' | 'hair' | 'outfit', id: string) =>
    KEY_RAMPS[kind].forEach((key, k) => swap.set(key, hex(ramps(kind)[id]?.[k] ?? '#ff00ff')));
  pick('skin', skins[a.i % skins.length] ?? 'light');
  pick('hair', hairColors[a.i % hairColors.length] ?? 'brown');
  pick('outfit', outfitColors[a.i % outfitColors.length] ?? 'blue');
  const layers = ['body/base', `outfit/${a.outfit}`, `hair/${a.hair}`, ...(a.accessory ? [`accessory/${a.accessory}`] : [])];
  for (const path of layers) {
    const src = layer(path);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) {
        const s = (y * src.width + x) * 4;
        if ((src.data[s + 3] ?? 0) === 0) continue;
        const rgb = [src.data[s] ?? 0, src.data[s + 1] ?? 0, src.data[s + 2] ?? 0];
        const key = `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
        const color = swap.get(key) ?? rgb;
        for (let yy = 0; yy < SCALE; yy++) {
          for (let xx = 0; xx < SCALE; xx++) {
            const o = (((y + 2) * SCALE + yy) * canvas.width + (a.i * W + 2 + x) * SCALE + xx) * 4;
            canvas.data.set([...color, 255], o);
          }
        }
      }
    }
  }
}
writeFileSync(out, PNG.sync.write(canvas));
console.log(`avatares em ${out}`);
