// Folha de revisão ampliada de um PNG de assets sobre fundo creme (onde a arte vai aparecer).
// `pnpm tsx scripts/art-sheet.ts <entrada.png> <saida.png> [escala] [fundo-hex]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [src, out, scaleArg = '6', bg = 'fdcbb0'] = process.argv.slice(2);
if (!src || !out) throw new Error('uso: art-sheet.ts <entrada.png> <saida.png> [escala] [fundo-hex]');
const img = PNG.sync.read(readFileSync(src));
const scale = Number(scaleArg);
const back = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16));
const sheet = new PNG({ width: img.width * scale, height: img.height * scale });
for (let y = 0; y < sheet.height; y++) {
  for (let x = 0; x < sheet.width; x++) {
    const i = (Math.floor(y / scale) * img.width + Math.floor(x / scale)) * 4;
    const alpha = (img.data[i + 3] ?? 0) / 255;
    const rgb = [0, 1, 2].map((c) => Math.round((img.data[i + c] ?? 0) * alpha + (back[c] ?? 0) * (1 - alpha)));
    sheet.data.set([...rgb, 255], (y * sheet.width + x) * 4);
  }
}
writeFileSync(out, PNG.sync.write(sheet));
