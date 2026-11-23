// Import direto do arquivo: o pacote inteiro depende do catálogo que estes scripts geram.
import { KEY_RAMPS } from '../../packages/shared/src/assets.ts';
import { PNG } from 'pngjs';

export { KEY_RAMPS };

/** Todas as cores-chave da troca de paleta (pele, cabelo, roupa) numa lista só. */
export const KEY_COLORS: readonly string[] = Object.values(KEY_RAMPS).flat();

const HEX = /^#?([0-9a-f]{6})$/i;

/** Hex em minúsculas e com `#`; aceita a entrada com ou sem `#` e lança erro se não for `rrggbb`. */
export function normalizeHex(value: string): string {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) throw new Error(`cor inválida: "${value}"`);
  return `#${match[1].toLowerCase()}`;
}

/** Lê um arquivo de paleta com um hex por linha, ignorando linhas em branco. */
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
      // O buffer do PNG é RGBA linha a linha: 4 bytes por pixel.
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3] ?? 0;
      if (alpha === 0) continue;
      const color = `#${[png.data[offset], png.data[offset + 1], png.data[offset + 2]]
        .map((channel) => (channel ?? 0).toString(16).padStart(2, '0'))
        .join('')}`;
      if (alpha !== 255 || !allowed.has(color)) violations.push({ x, y, color, alpha });
    }
  }
  return violations;
}
