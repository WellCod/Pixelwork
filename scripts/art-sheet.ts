// Folha de revisão ampliada de um PNG de assets sobre fundo creme (onde a arte vai aparecer).
// `pnpm tsx scripts/art-sheet.ts <entrada.png> <saida.png> [escala] [fundo-hex]`.
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [src, out, scaleArg, bg] = process.argv.slice(2);
const img = PNG.sync.read(readFileSync(src!));
const s = Number(scaleArg ?? 6);
const o = new PNG({ width: img.width * s, height: img.height * s });
const back = (bg ?? 'fdcbb0').match(/../g)!.map((h) => parseInt(h, 16));
for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
  const i = (Math.floor(y / s) * img.width + Math.floor(x / s)) * 4;
  const a = img.data[i + 3]! / 255;
  const px = [0, 1, 2].map((c) => Math.round(img.data[i + c]! * a + back[c]! * (1 - a)));
  o.data.set([...px, 255], (y * o.width + x) * 4);
}
writeFileSync(out!, PNG.sync.write(o));
