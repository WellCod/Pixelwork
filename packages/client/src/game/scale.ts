import { RENDER_SCALE } from '@pixelwork/shared';

export const dpr = (): number => window.devicePixelRatio || 1;

/**
 * Zoom base da câmera: pixels do canvas por pixel do mundo. O canvas tem a resolução real da tela
 * (pixels físicos), e o pixel art ganha a escala aqui, arredondada para inteiro para não borrar.
 * Com o canvas em meia resolução esticado pelo CSS, o texto de 7 px tinha só 7 pixels de altura
 * no zoom mínimo e ficava ilegível.
 */
export function baseZoom(): number {
  return Math.max(1, Math.round(RENDER_SCALE * dpr()));
}

/** Converte pixels do canvas em pixels de tela (CSS). */
export function canvasToCss(value: number): number {
  return value / dpr();
}
