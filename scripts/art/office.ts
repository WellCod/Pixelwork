// Móveis pequenos (16x16) no padrão novo. A âncora é o canto inferior esquerdo da célula.
import { Canvas, RAMPS } from '../lib/draw.ts';
import { sprite, type Pixels } from '../lib/pixels.ts';

/** Cadeira de escritório vista de frente: encosto, assento, coluna e base com rodinhas. */
export const officeChair: Pixels = sprite(
  [
    '................',
    '................',
    '.....oooooo.....',
    '....ohhhhhho....',
    '....ohbbbbbo....',
    '....obbbbbdo....',
    '....obbbbbdo....',
    '...ooddddddoo...',
    '..ohhhhhhhhhho..',
    '..ohbbbbbbbbdo..',
    '..obbbbbbbbbdo..',
    '..oddddddddddo..',
    '...oooooooooo...',
    '.......mo.......',
    '.....omoooomo...',
    '....o.o....o.o..',
  ],
  { o: 'ink', h: 'mauve', b: 'dusk', d: 'shadow', m: 'gray' },
  'cadeira de escritório',
);

/** Planta de vaso: folhagem em massa com luz de cima à esquerda, vaso branco. */
export const pottedPlant: Pixels = (() => {
  const canvas = new Canvas(16, 16);
  // Copa como união de quatro círculos (centro e raio em pixels).
  const circles = [
    { x: 8, y: 5.5, r: 4.6 },
    { x: 4.6, y: 7.5, r: 3.2 },
    { x: 11.4, y: 7.5, r: 3.2 },
    { x: 8, y: 2.4, r: 2.4 },
  ];
  const leaves = (x: number, y: number) =>
    y < 11 && circles.some((circle) => Math.hypot(x + 0.5 - circle.x, y + 0.5 - circle.y) <= circle.r);
  canvas.blob(leaves, RAMPS.leaf, { x: 7, y: 4, r: 6 });
  canvas.outline(RAMPS.leaf.outline);
  // Vaso: boca mais larga, base mais estreita.
  canvas.box(4, 10, 8, 2, RAMPS.potWhite);
  canvas.box(5, 12, 6, 3, RAMPS.potWhite);
  canvas.outline(RAMPS.potWhite.outline, (_x, y) => y >= 10);
  canvas.hline(5, 11, 6, 'gray');
  return canvas.toPixels();
})();
