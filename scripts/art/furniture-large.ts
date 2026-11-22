// Móveis de várias células, um objeto só no mapa (docs/art.md). Cada lista é um tileset com a
// célula do tamanho indicado; só acrescentar no fim.
import { Canvas, RAMPS, type Ramp } from '../lib/draw.ts';
import type { TileArt } from './tiles.ts';

/** Sofá de dois lugares visto de frente (32x16): encosto, braços, duas almofadas e pés. */
function sofa(ramp: Ramp): Canvas {
  const c = new Canvas(32, 16);
  c.box(3, 1, 26, 8, ramp); // encosto
  c.hline(4, 7, 24, ramp.dark); // dobra entre encosto e assento
  c.box(4, 8, 12, 5, ramp); // almofada esquerda
  c.box(16, 8, 12, 5, ramp); // almofada direita
  c.vline(15, 9, 3, ramp.dark);
  c.box(0, 4, 5, 10, ramp); // braço esquerdo
  c.box(27, 4, 5, 10, ramp); // braço direito
  c.vline(4, 5, 8, ramp.dark);
  c.vline(27, 5, 8, ramp.light);
  c.hline(1, 13, 30, ramp.dark); // saia
  c.outline(ramp.outline);
  c.rect(2, 14, 2, 1, ramp.outline).rect(28, 14, 2, 1, ramp.outline); // pés
  return c;
}

/** Tileset `furniture-2x1`: célula 32x16. */
export const FURNITURE_2X1: TileArt[] = [
  { pixels: sofa(RAMPS.fabricPeach).toPixels(), collides: true, itemId: 'sofa-peach' },
  { pixels: sofa(RAMPS.fabricSage).toPixels(), collides: true, itemId: 'sofa-sage' },
];
