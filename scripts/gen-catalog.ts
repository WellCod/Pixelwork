import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogError, buildCatalog } from './lib/catalog.ts';
import { parsePalette } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const assets = join(root, 'assets');
const out = join(root, 'packages/shared/src/catalog.generated.ts');

const readJson = (path: string): unknown => JSON.parse(readFileSync(join(assets, path), 'utf8'));

try {
  const code = buildCatalog({
    manifest: readJson('manifest.json'),
    ramps: {
      skin: readJson('palettes/skin.json'),
      hair: readJson('palettes/hair.json'),
      outfit: readJson('palettes/outfit.json'),
    },
    palette: new Set(parsePalette(readFileSync(join(assets, 'palette.hex'), 'utf8'))),
    fileExists: (path) => existsSync(join(assets, path)),
  });
  writeFileSync(out, code);
  console.log('catálogo gerado em packages/shared/src/catalog.generated.ts');
} catch (error) {
  if (!(error instanceof CatalogError)) throw error;
  console.error(error.message);
  process.exit(1);
}
