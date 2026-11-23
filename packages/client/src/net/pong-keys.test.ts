import { describe, expect, it } from 'vitest';
import { PaddleKeys } from './pong-keys.ts';

function setup() {
  const sent: number[] = [];
  const keys = new PaddleKeys((dir) => sent.push(dir));
  return { keys, sent };
}

describe('PaddleKeys', () => {
  it('fora da mesa (ou digitando) não trata W/S nem setas', () => {
    const { keys, sent } = setup();
    expect(keys.press('s', true, false)).toBe(false);
    expect(keys.press('ArrowDown', true, false)).toBe(false);
    expect(sent).toEqual([]);
  });

  it('na mesa, só a mudança de direção é enviada', () => {
    const { keys, sent } = setup();
    expect(keys.press('ArrowDown', true, true)).toBe(true);
    keys.press('ArrowDown', true, true);
    keys.press('s', true, true);
    keys.press('ArrowDown', false, true);
    keys.press('s', false, true);
    expect(sent).toEqual([1, 0]);
  });

  it('cima e baixo juntos param a raquete', () => {
    const { keys, sent } = setup();
    keys.press('w', true, true);
    keys.press('touch-down', true, true);
    expect(sent).toEqual([-1, 0]);
  });

  it('reset esquece a última direção: o próximo aperto vale de novo', () => {
    const { keys, sent } = setup();
    keys.press('ArrowDown', true, true);
    keys.reset();
    keys.press('ArrowDown', true, true);
    expect(sent).toEqual([1, 1]);
  });

  it('outras teclas não são tratadas', () => {
    expect(setup().keys.press('a', true, true)).toBe(false);
  });
});
