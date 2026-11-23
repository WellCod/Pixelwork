import { describe, expect, it } from 'vitest';
import { compileMap } from '../map.ts';
import { FIRSTGID, buildTestMap } from '../testing.ts';
import { CommandStack } from './history.ts';
import type { TiledDoc } from './commands.ts';
import { RUGS, rugMask, paintRug } from './rug.ts';

const freshDoc = () => JSON.parse(JSON.stringify(buildTestMap({ width: 12, height: 10 }))) as TiledDoc;
const floorAt = (doc: TiledDoc, x: number, y: number) => {
  const layer = doc.layers.find((candidate) => candidate.name === 'floor');
  return layer?.type === 'tilelayer' ? layer.data[y * doc.width + x] : undefined;
};
const rugGid = (mask: number) => FIRSTGID.floors + RUGS.lavender.firstFrame + mask;

describe('rugMask', () => {
  it('marca as bordas de fora do retângulo: N=1, S=2, O=4, L=8', () => {
    expect(rugMask(0, 0, 3, 3)).toBe(1 + 4);
    expect(rugMask(1, 1, 3, 3)).toBe(0);
    expect(rugMask(2, 2, 3, 3)).toBe(2 + 8);
    expect(rugMask(0, 0, 1, 1)).toBe(15);
    expect(rugMask(1, 0, 3, 1)).toBe(1 + 2);
  });
});

describe('paintRug', () => {
  it('3x3 pinta cantos, bordas e miolo com o tile de cada máscara', () => {
    const stack = new CommandStack(freshDoc());
    stack.execute(paintRug(stack.doc, 'lavender', 2, 2, 4, 4));
    expect(floorAt(stack.doc, 2, 2)).toBe(rugGid(1 + 4));
    expect(floorAt(stack.doc, 3, 2)).toBe(rugGid(1));
    expect(floorAt(stack.doc, 3, 3)).toBe(rugGid(0));
    expect(floorAt(stack.doc, 4, 4)).toBe(rugGid(2 + 8));
  });

  it('1x1 fecha a borda nos quatro lados; uma fileira fecha em cima e embaixo', () => {
    const stack = new CommandStack(freshDoc());
    stack.execute(paintRug(stack.doc, 'lavender', 5, 5, 5, 5));
    expect(floorAt(stack.doc, 5, 5)).toBe(rugGid(15));
    stack.execute(paintRug(stack.doc, 'lavender', 2, 7, 5, 7));
    expect(floorAt(stack.doc, 3, 7)).toBe(rugGid(1 + 2));
    expect(floorAt(stack.doc, 2, 7)).toBe(rugGid(1 + 2 + 4));
  });

  it('aceita o retângulo arrastado em qualquer direção, recorta ao mapa e continua no contrato', () => {
    const stack = new CommandStack(freshDoc());
    stack.execute(paintRug(stack.doc, 'lavender', 14, 12, 9, 7));
    expect(floorAt(stack.doc, 9, 7)).toBe(rugGid(1 + 4));
    expect(floorAt(stack.doc, 11, 9)).toBe(rugGid(2 + 8));
    expect(compileMap(stack.doc).ok).toBe(true);
  });
});
