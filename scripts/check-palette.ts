import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PNG } from 'pngjs';
import { KEY_COLORS, findViolations, parsePalette } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
// Diretório opcional no argumento, usado pelos testes.
const assetsDir = process.argv[2] ?? join(root, 'assets');

function listPngs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => join(entry.parentPath, entry.name));
}

const allowed = new Set([
  ...parsePalette(readFileSync(join(assetsDir, 'palette.hex'), 'utf8')),
  ...KEY_COLORS,
]);

let failed = 0;
const files = listPngs(assetsDir);
for (const file of files) {
  const violations = findViolations(PNG.sync.read(readFileSync(file)), allowed);
  if (violations.length === 0) continue;
  failed++;
  const sample = violations
    .slice(0, 5)
    .map((v) => `(${v.x},${v.y}) ${v.color} alfa ${v.alpha}`)
    .join(', ');
  console.error(`${relative(assetsDir, file)}: ${violations.length} pixels fora da paleta: ${sample}`);
}

if (failed > 0) {
  console.error(`${failed} de ${files.length} PNGs fora da paleta`);
  process.exit(1);
}
console.log(`${files.length} PNGs dentro da paleta`);
