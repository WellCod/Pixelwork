// Desenho por formas com contorno e sombreamento consistentes (docs/art.md, guia de estilo):
// luz de cima e da esquerda, contorno no tom mais escuro da rampa, nunca preto.
import { PALETTE, type ColorName } from './colors.ts';
import type { Pixels } from './pixels.ts';

/** Rampa de um material, do contorno ao brilho. */
export interface Ramp {
  outline: ColorName;
  dark: ColorName;
  base: ColorName;
  light: ColorName;
  /** Brilho pontual; sem ele, usa `light`. */
  shine?: ColorName;
}

/**
 * Tela de desenho por nome de cor (null = transparente). Os métodos encadeiam, e `toPixels`
 * converte para a matriz de hex usada no resto dos geradores.
 */
export class Canvas {
  private readonly cells: (ColorName | null)[][];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => null));
  }

  get(x: number, y: number): ColorName | null {
    return this.cells[y]?.[x] ?? null;
  }

  /** Pinta um pixel; fora da tela é ignorado, para as formas poderem passar da borda. */
  px(x: number, y: number, color: ColorName): this {
    const row = this.cells[y];
    if (row && x >= 0 && x < this.width) row[x] = color;
    return this;
  }

  rect(x: number, y: number, rectWidth: number, rectHeight: number, color: ColorName): this {
    for (let rowY = y; rowY < y + rectHeight; rowY++) {
      for (let columnX = x; columnX < x + rectWidth; columnX++) this.px(columnX, rowY, color);
    }
    return this;
  }

  hline(x: number, y: number, lineWidth: number, color: ColorName): this {
    return this.rect(x, y, lineWidth, 1, color);
  }

  vline(x: number, y: number, lineHeight: number, color: ColorName): this {
    return this.rect(x, y, 1, lineHeight, color);
  }

  /**
   * Caixa sombreada de um material: topo claro (luz de cima), lado direito e base escuros, um
   * brilho no canto de cima à esquerda. O contorno vem depois, em `outline`.
   */
  box(x: number, y: number, boxWidth: number, boxHeight: number, ramp: Ramp): this {
    this.rect(x, y, boxWidth, boxHeight, ramp.base);
    this.hline(x, y, boxWidth, ramp.light);
    this.vline(x + boxWidth - 1, y + 1, boxHeight - 1, ramp.dark);
    this.hline(x, y + boxHeight - 1, boxWidth, ramp.dark);
    this.px(x, y, ramp.shine ?? ramp.light);
    return this;
  }

  /**
   * Massa orgânica (folhagem, copa) pela máscara `inside`, sombreada pela posição em relação ao
   * centro de luz: brilho em cima à esquerda, sombra embaixo à direita, e um ruído determinístico
   * que desenha a separação das folhas.
   */
  blob(inside: (x: number, y: number) => boolean, ramp: Ramp, center: { x: number; y: number; r: number }): this {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!inside(x, y)) continue;
        // Posição relativa ao centro, normalizada pelo raio; a luz cresce para cima e para a esquerda.
        const relativeX = (x - center.x) / center.r;
        const relativeY = (y - center.y) / center.r;
        const light = -(relativeX * 0.7 + relativeY * 0.9);
        // Hash espacial com dois primos grandes: o mesmo pixel sempre dá o mesmo ruído.
        const noise = ((x * 73856093) ^ (y * 19349663)) % 7;
        let tone: ColorName = ramp.base;
        if (light > 0.55) tone = ramp.shine ?? ramp.light;
        else if (light > 0.15) tone = ramp.light;
        else if (light < -0.45) tone = ramp.dark;
        if (noise === 0) tone = ramp.dark;
        if (noise === 1 && light > 0) tone = ramp.light;
        this.px(x, y, tone);
      }
    }
    return this;
  }

  /** Pinta de `color` cada pixel preenchido que encosta num transparente (contorno interno). */
  outline(color: ColorName, only?: (x: number, y: number) => boolean): this {
    // Coleta as bordas antes de pintar, para a borda ser sempre a da forma original.
    const edgePixels: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) === null || (only && !only(x, y))) continue;
        const touchesTransparent = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx = 0, dy = 0]) => this.get(x + dx, y + dy) === null);
        if (touchesTransparent) edgePixels.push([x, y]);
      }
    }
    for (const [x, y] of edgePixels) this.px(x, y, color);
    return this;
  }

  toPixels(): Pixels {
    return this.cells.map((row) => row.map((colorName) => (colorName === null ? '.' : PALETTE[colorName])));
  }
}

/** Rampas dos materiais do guia de estilo (docs/art.md). */
export const RAMPS = {
  leaf: { outline: 'pine', dark: 'green', base: 'emerald', light: 'leaf', shine: 'sprout' },
  potWhite: { outline: 'dusk', dark: 'gray', base: 'mist', light: 'white' },
  potClay: { outline: 'rust', dark: 'clay', base: 'tan', light: 'honey' },
  fabricPeach: { outline: 'rust', dark: 'clay', base: 'peach', light: 'cream' },
  fabricSage: { outline: 'slate', dark: 'fern', base: 'sage', light: 'celery' },
  charcoal: { outline: 'ink', dark: 'shadow', base: 'dusk', light: 'mauve', shine: 'gray' },
  // Bétula: creme com luz branca; o mel saturado brigava com o fundo claro.
  woodLight: { outline: 'clay', dark: 'peach', base: 'cream', light: 'white' },
  woodDark: { outline: 'ink', dark: 'bark', base: 'rust', light: 'clay' },
  metal: { outline: 'shadow', dark: 'dusk', base: 'gray', light: 'mist', shine: 'white' },
  white: { outline: 'dusk', dark: 'gray', base: 'mist', light: 'white' },
} as const satisfies Record<string, Ramp>;
