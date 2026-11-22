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

  px(x: number, y: number, color: ColorName): this {
    const row = this.cells[y];
    if (row && x >= 0 && x < this.width) row[x] = color;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, color: ColorName): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, color);
    return this;
  }

  hline(x: number, y: number, w: number, color: ColorName): this {
    return this.rect(x, y, w, 1, color);
  }

  vline(x: number, y: number, h: number, color: ColorName): this {
    return this.rect(x, y, 1, h, color);
  }

  /**
   * Caixa sombreada de um material: topo claro (luz de cima), lado direito e base escuros, um
   * brilho no canto de cima à esquerda. O contorno vem depois, em `outline`.
   */
  box(x: number, y: number, w: number, h: number, ramp: Ramp): this {
    this.rect(x, y, w, h, ramp.base);
    this.hline(x, y, w, ramp.light);
    this.vline(x + w - 1, y + 1, h - 1, ramp.dark);
    this.hline(x, y + h - 1, w, ramp.dark);
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
        const lx = (x - center.x) / center.r;
        const ly = (y - center.y) / center.r;
        const light = -(lx * 0.7 + ly * 0.9);
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
    const edge: [number, number][] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) === null || (only && !only(x, y))) continue;
        const open = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx = 0, dy = 0]) => this.get(x + dx, y + dy) === null);
        if (open) edge.push([x, y]);
      }
    }
    for (const [x, y] of edge) this.px(x, y, color);
    return this;
  }

  toPixels(): Pixels {
    return this.cells.map((row) => row.map((c) => (c === null ? '.' : PALETTE[c])));
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
