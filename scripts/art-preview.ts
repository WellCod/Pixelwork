// Folha de revisão da arte: tilesets e personagens compostos com a troca de paleta, ampliados.
// `pnpm tsx scripts/art-preview.ts <saida.png>`. Não vai para o repositório de assets.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_RAMPS } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const outputPath = process.argv[2] ?? 'art-preview.png';
const SCALE = 4;
const readAsset = (path: string) => PNG.sync.read(readFileSync(join(root, 'assets', path)));
const readRamps = (kind: string) =>
  JSON.parse(readFileSync(join(root, 'assets/palettes', `${kind}.json`), 'utf8')) as Record<string, string[]>;

// Coluna da esquerda com os tilesets (128 px de largura) e, à direita, três personagens de 64 px,
// com 8 px de margem e 16 px entre eles.
const canvas = new PNG({ width: 128 * SCALE + 24 + 3 * (64 * SCALE + 16), height: 160 * SCALE + 16 });
for (let offset = 0; offset < canvas.data.length; offset += 4) canvas.data.set([0x3a, 0x44, 0x66, 255], offset);

/**
 * Copia a região (`sourceX`, `sourceY`, `regionWidth` x `regionHeight`) de `source` para a tela,
 * ampliada `SCALE` vezes a partir de (`dx`, `dy`). Com `swap`, troca cada cor-chave pela cor da rampa.
 */
function blit(
  source: PNG,
  dx: number,
  dy: number,
  swap?: Map<string, number[]>,
  sourceX = 0,
  sourceY = 0,
  regionWidth = source.width,
  regionHeight = source.height,
): void {
  for (let y = 0; y < regionHeight; y++) {
    for (let x = 0; x < regionWidth; x++) {
      const sourceOffset = ((sourceY + y) * source.width + sourceX + x) * 4;
      if ((source.data[sourceOffset + 3] ?? 0) === 0) continue;
      let rgb = [source.data[sourceOffset] ?? 0, source.data[sourceOffset + 1] ?? 0, source.data[sourceOffset + 2] ?? 0];
      const hexKey = `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
      rgb = swap?.get(hexKey) ?? rgb;
      for (let scaledY = 0; scaledY < SCALE; scaledY++) {
        for (let scaledX = 0; scaledX < SCALE; scaledX++) {
          const targetOffset = ((dy + y * SCALE + scaledY) * canvas.width + dx + x * SCALE + scaledX) * 4;
          if (targetOffset >= 0 && targetOffset < canvas.data.length) canvas.data.set([...rgb, 255], targetOffset);
        }
      }
    }
  }
}

// Tilesets empilhados na coluna da esquerda.
let nextY = 8;
for (const id of ['floors', 'walls', 'furniture', 'desk-decor']) {
  const sheet = readAsset(`tilesets/${id}.png`);
  blit(sheet, 8, nextY);
  nextY += sheet.height * SCALE + 8;
}

/** Mapa cor-chave -> RGB da rampa escolhida, nas três rampas do personagem. */
function swapFor(skin: string, hair: string, outfit: string): Map<string, number[]> {
  const swap = new Map<string, number[]>();
  const keyToRamp: [readonly string[], string[]][] = [
    [KEY_RAMPS.skin, readRamps('skin')[skin] ?? []],
    [KEY_RAMPS.hair, readRamps('hair')[hair] ?? []],
    [KEY_RAMPS.outfit, readRamps('outfit')[outfit] ?? []],
  ];
  for (const [keyColors, rampColors] of keyToRamp) {
    keyColors.forEach((keyColor, i) => {
      const rampColor = rampColors[i];
      if (rampColor) swap.set(keyColor, [1, 3, 5].map((offset) => parseInt(rampColor.slice(offset, offset + 2), 16)));
    });
  }
  return swap;
}

const looks = [
  { layers: ['body/base', 'outfit/basic', 'hair/short'], skin: 'light', hair: 'brown', outfit: 'blue' },
  { layers: ['body/base', 'outfit/hoodie', 'hair/long', 'accessory/glasses'], skin: 'medium', hair: 'blond', outfit: 'red' },
  { layers: ['body/base', 'outfit/basic', 'hair/spiky', 'accessory/cap'], skin: 'dark', hair: 'black', outfit: 'green' },
];
// Cada visual na sua coluna à direita dos tilesets, com as camadas sobrepostas na ordem da lista.
looks.forEach((look, i) => {
  const swap = swapFor(look.skin, look.hair, look.outfit);
  const columnX = 128 * SCALE + 24 + i * (64 * SCALE + 16);
  for (const layer of look.layers) blit(readAsset(`characters/${layer}.png`), columnX, 8, swap);
});
writeFileSync(outputPath, PNG.sync.write(canvas));
console.log(`prévia em ${outputPath}`);
