import { STEP_MS } from '@pixelwork/shared';
import { describe, expect, it } from 'vitest';
import { Mover } from './mover.ts';

describe('Mover', () => {
  it('leva STEP_MS para andar um tile', () => {
    const m = new Mover(0, 0);
    m.push(1, 0);
    m.update(STEP_MS / 2);
    expect(m.x).toBeCloseTo(0.5);
    m.update(STEP_MS / 2);
    expect(m.x).toBe(1);
    expect(m.moving).toBe(false);
  });

  it('vários passos no mesmo tick não acumulam atraso', () => {
    const m = new Mover(0, 0);
    m.push(1, 0);
    m.push(2, 0);
    m.push(3, 0);
    m.update(2 * STEP_MS);
    expect(m.x).toBe(3);
  });

  it('em ritmo constante fica no máximo um passo atrás', () => {
    const m = new Mover(0, 0);
    for (let i = 1; i <= 20; i++) {
      m.push(i, 0);
      m.update(STEP_MS * 0.8);
      m.update(STEP_MS * 0.2);
      expect(i - m.x).toBeLessThan(1);
    }
  });

  it('salto maior que um tile vira teleporte', () => {
    const m = new Mover(0, 0);
    m.push(5, 5);
    expect([m.x, m.y, m.moving]).toEqual([5, 5, false]);
  });
});
