// Folha de revisão dos avatares: cada cabelo, roupa e acessório de frente, com as rampas trocadas,
// ampliada. `pnpm tsx scripts/art-avatars.ts [saida.png]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const outputPath = process.argv[2] ?? 'art-avatars.png';
const SCALE = 5;
const manifest = JSON.parse(readFileSync(join(root, 'assets/manifest.json'), 'utf8')) as {
  characters: Record<'hair' | 'outfit' | 'accessory', { id: string }[]>;
};
const readRamps = (kind: string) =>
  JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;
const readLayer = (path: string) => PNG.sync.read(readFileSync(join(root, 'assets/characters', `${path}.png`)));
const hexToRgb = (hex: string) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));

const skins = Object.keys(readRamps('skin'));
const hairColors = Object.keys(readRamps('hair'));
const outfitColors = Object.keys(readRamps('outfit'));

interface Avatar {
  hair: string;
  outfit: string;
  accessory: string | null;
  index: number;
}
const hairs = manifest.characters.hair.map((hair) => hair.id);
const outfits = manifest.characters.outfit.map((outfit) => outfit.id);
const accessories = [null, ...manifest.characters.accessory.map((accessory) => accessory.id)];
// Um avatar por item da maior lista; as menores repetem em ciclo, para todo item aparecer ao menos uma vez.
const avatarCount = Math.max(hairs.length, outfits.length, accessories.length);
const avatars: Avatar[] = Array.from({ length: avatarCount }, (_, i) => ({
  hair: hairs[i % hairs.length] ?? 'short',
  outfit: outfits[i % outfits.length] ?? 'basic',
  accessory: accessories[i % accessories.length] ?? null,
  index: i,
}));

// Cada avatar ocupa uma coluna de 20 px (sprite de 16 px com 2 px de margem de cada lado).
const COLUMN_WIDTH = 20;
const canvas = new PNG({ width: avatars.length * COLUMN_WIDTH * SCALE, height: 36 * SCALE });
for (let offset = 0; offset < canvas.data.length; offset += 4) canvas.data.set([0xfd, 0xcb, 0xb0, 255], offset);

for (const avatar of avatars) {
  // Troca de paleta: cada cor-chave vira a cor da rampa escolhida; magenta denuncia rampa faltando.
  const swap = new Map<string, number[]>();
  const pickRamp = (kind: 'skin' | 'hair' | 'outfit', rampId: string) =>
    KEY_RAMPS[kind].forEach((keyColor, toneIndex) =>
      swap.set(keyColor, hexToRgb(readRamps(kind)[rampId]?.[toneIndex] ?? '#ff00ff')),
    );
  pickRamp('skin', skins[avatar.index % skins.length] ?? 'light');
  pickRamp('hair', hairColors[avatar.index % hairColors.length] ?? 'brown');
  pickRamp('outfit', outfitColors[avatar.index % outfitColors.length] ?? 'blue');
  const layers = [
    'body/base',
    `outfit/${avatar.outfit}`,
    `hair/${avatar.hair}`,
    ...(avatar.accessory ? [`accessory/${avatar.accessory}`] : []),
  ];
  for (const path of layers) {
    const layerImage = readLayer(path);
    // Só o primeiro quadro da folha (16x32, de frente parado), deslocado 2 px da borda da coluna.
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) {
        const sourceOffset = (y * layerImage.width + x) * 4;
        if ((layerImage.data[sourceOffset + 3] ?? 0) === 0) continue;
        const rgb = [
          layerImage.data[sourceOffset] ?? 0,
          layerImage.data[sourceOffset + 1] ?? 0,
          layerImage.data[sourceOffset + 2] ?? 0,
        ];
        const hexKey = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        const color = swap.get(hexKey) ?? rgb;
        for (let scaledY = 0; scaledY < SCALE; scaledY++) {
          for (let scaledX = 0; scaledX < SCALE; scaledX++) {
            const targetOffset =
              (((y + 2) * SCALE + scaledY) * canvas.width + (avatar.index * COLUMN_WIDTH + 2 + x) * SCALE + scaledX) * 4;
            canvas.data.set([...color, 255], targetOffset);
          }
        }
      }
    }
  }
}
writeFileSync(outputPath, PNG.sync.write(canvas));
console.log(`avatares em ${outputPath}`);
