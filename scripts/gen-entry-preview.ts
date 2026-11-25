// Atualiza a prévia pública com os tiles do mapa padrão: pnpm exec tsx scripts/gen-entry-preview.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TILE_PX } from '@pixelwork/shared';
import { objectLayer, propertyValue } from '@pixelwork/shared/editor';
import { PNG } from 'pngjs';
import { loadDemoTemplate } from '../packages/server/src/demo.ts';

const root = join(import.meta.dirname, '..');
const output = join(root, 'packages/client/src/assets/office-preview');
const map = loadDemoTemplate();
const zones = objectLayer(map, 'zones').objects;
const crops = [
  { key: 'sala-aurora', name: 'aurora', dx: 0, dy: -1, width: 12, height: 11 },
  { key: 'lounge', name: 'lounge', dx: 1, dy: 2, width: 10, height: 7 },
  { key: 'jogos', name: 'jogos', dx: 0, dy: 0, width: 14, height: 7 },
] as const;

const working = mkdtempSync(join(tmpdir(), 'pixelwork-preview-'));
const mapPath = join(working, 'demo.json');
const renderPath = join(working, 'demo.png');
try {
  writeFileSync(mapPath, JSON.stringify(map));
  execFileSync(process.execPath, ['--import', 'tsx', join(root, 'scripts/render-map.ts'), mapPath, renderPath, '1'], { cwd: root });
  const office = PNG.sync.read(readFileSync(renderPath));
  mkdirSync(output, { recursive: true });
  for (const { key, name, dx, dy, width, height } of crops) {
    const zone = zones.find((entry) => propertyValue(entry, 'zone_key') === key);
    if (!zone) throw new Error(`Área da prévia ausente no mapa: ${key}`);
    const x = zone.x + dx * TILE_PX;
    const y = zone.y + dy * TILE_PX;
    const image = new PNG({ width: width * TILE_PX, height: height * TILE_PX });
    PNG.bitblt(office, image, x, y, image.width, image.height, 0, 0);
    writeFileSync(join(output, `${name}.png`), PNG.sync.write(image));
    console.log(`Prévia ${name}: ${image.width}×${image.height}`);
  }
} finally {
  rmSync(renderPath, { force: true });
  rmSync(mapPath, { force: true });
  rmdirSync(working);
}
