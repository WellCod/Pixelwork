import { PNG } from 'pngjs';

// Rampas-chave da troca de paleta (docs/art.md, seção 3): ficam fora da paleta de propósito.
export const KEY_RAMPS = {
  skin: ['#ff0001', '#ff0002', '#ff0003', '#ff0004'],
  hair: ['#00ff01', '#00ff02', '#00ff03', '#00ff04'],
  outfit: ['#0001ff', '#0002ff', '#0003ff', '#0004ff'],
} as const;

export const KEY_COLORS: readonly string[] = Object.values(KEY_RAMPS).flat();

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(value: string): string {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) throw new Error(`cor inválida: "${value}"`);
  return `#${match[1].toLowerCase()}`;
}

export function parsePalette(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map(normalizeHex);
}

export interface Violation {
  x: number;
  y: number;
  color: string;
  alpha: number;
}

/** Pixels que não são transparência total nem cor opaca do conjunto permitido. */
export function findViolations(png: PNG, allowed: ReadonlySet<string>): Violation[] {
  const violations: Violation[] = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const alpha = png.data[i + 3] ?? 0;
      if (alpha === 0) continue;
      const color = `#${[png.data[i], png.data[i + 1], png.data[i + 2]]
        .map((c) => (c ?? 0).toString(16).padStart(2, '0'))
        .join('')}`;
      if (alpha !== 255 || !allowed.has(color)) violations.push({ x, y, color, alpha });
    }
  }
  return violations;
}
