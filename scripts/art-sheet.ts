// Folha de revisão ampliada de um PNG de assets sobre fundo creme (onde a arte vai aparecer).
// `pnpm tsx scripts/art-sheet.ts <entrada.png> <saida.png> [escala] [fundo-hex]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [inputPath, outputPath, scaleArg = '6', backgroundHex = 'fdcbb0'] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('uso: art-sheet.ts <entrada.png> <saida.png> [escala] [fundo-hex]');
const image = PNG.sync.read(readFileSync(inputPath));
const scale = Number(scaleArg);
const backgroundRgb = [0, 2, 4].map((offset) => parseInt(backgroundHex.slice(offset, offset + 2), 16));
const sheet = new PNG({ width: image.width * scale, height: image.height * scale });
// Ampliação por vizinho mais próximo: cada pixel da folha lê o pixel de origem na posição dividida
// pela escala e mistura com o fundo pelo alfa, para a transparência aparecer como o fundo do mapa.
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const sourceOffset = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
    const alpha = (image.data[sourceOffset + 3] ?? 0) / 255;
    const blendedRgb = [0, 1, 2].map((channel) =>
      Math.round((image.data[sourceOffset + channel] ?? 0) * alpha + (backgroundRgb[channel] ?? 0) * (1 - alpha)),
    );
    sheet.data.set([...blendedRgb, 255], (y * sheet.width + x) * 4);
  }
}
writeFileSync(outputPath, PNG.sync.write(sheet));
