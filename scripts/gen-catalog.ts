// Valida assets/manifest.json, as rampas de paleta e os .tsj, e gera o catálogo tipado do pacote
// shared. Com erro, lista todos os problemas e sai com código 1 sem escrever nada.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogError, buildCatalog } from './lib/catalog.ts';
import { parsePalette } from './lib/palette.ts';

const root = join(import.meta.dirname, '..');
const assetsDir = join(root, 'assets');
const outputPath = join(root, 'packages/shared/src/catalog.generated.ts');

const readJson = (path: string): unknown => JSON.parse(readFileSync(join(assetsDir, path), 'utf8'));

try {
  const code = buildCatalog({
    manifest: readJson('manifest.json'),
    ramps: {
      skin: readJson('palettes/skin.json'),
      hair: readJson('palettes/hair.json'),
      outfit: readJson('palettes/outfit.json'),
    },
    palette: new Set(parsePalette(readFileSync(join(assetsDir, 'palette.hex'), 'utf8'))),
    fileExists: (path) => existsSync(join(assetsDir, path)),
    readTileset: (id) => readJson(`tilesets/${id}.tsj`),
  });
  writeFileSync(outputPath, code);
  console.log('catálogo gerado em packages/shared/src/catalog.generated.ts');
} catch (error) {
  if (!(error instanceof CatalogError)) throw error;
  console.error(error.message);
  process.exit(1);
}
