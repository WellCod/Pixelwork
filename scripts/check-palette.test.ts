import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_COLORS, findViolations } from './lib/palette.ts';

function png(pixels: [r: number, g: number, b: number, a: number][]): PNG {
  const image = new PNG({ width: pixels.length, height: 1 });
  pixels.forEach((p, i) => {
    image.data.set(p, i * 4);
  });
  return image;
}

const palette = new Set(['#181425', '#ffffff', ...KEY_COLORS]);

describe('findViolations', () => {
  it('aceita cor da paleta, cor-chave e transparência total', () => {
    const image = png([
      [0x18, 0x14, 0x25, 255],
      [0xff, 0x00, 0x01, 255],
      [0x12, 0x34, 0x56, 0],
    ]);
    expect(findViolations(image, palette)).toEqual([]);
  });

  it('acusa cor fora da paleta e alfa parcial', () => {
    const image = png([
      [0x12, 0x34, 0x56, 255],
      [0xff, 0xff, 0xff, 128],
    ]);
    expect(findViolations(image, palette)).toEqual([
      { x: 0, y: 0, color: '#123456', alpha: 255 },
      { x: 1, y: 0, color: '#ffffff', alpha: 128 },
    ]);
  });
});

describe('check-palette', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function run(pixels: Parameters<typeof png>[0]): { code: number; output: string } {
    dir = mkdtempSync(join(tmpdir(), 'palette-'));
    writeFileSync(join(dir, 'palette.hex'), '181425\nffffff\n');
    writeFileSync(join(dir, 'sprite.png'), PNG.sync.write(png(pixels)));
    try {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', join(import.meta.dirname, 'check-palette.ts'), dir],
        { encoding: 'utf8', stdio: 'pipe' },
      );
      return { code: 0, output };
    } catch (error) {
      const { status, stderr } = error as { status: number; stderr: string };
      return { code: status, output: stderr };
    }
  }

  it('passa com PNG dentro da paleta', () => {
    expect(run([[0xff, 0xff, 0xff, 255]]).code).toBe(0);
  });

  it('falha com PNG que usa cor fora da paleta e das cores-chave', () => {
    const result = run([[0x12, 0x34, 0x56, 255]]);
    expect(result.code).toBe(1);
    expect(result.output).toContain('sprite.png');
    expect(result.output).toContain('#123456');
  });
});
