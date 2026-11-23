import { STEP_MS } from '@pixelwork/shared';
import { describe, expect, it } from 'vitest';
import { Mover } from './mover.ts';

describe('Mover', () => {
  it('leva STEP_MS para andar um tile', () => {
    const mover = new Mover(0, 0);
    mover.push(1, 0);
    mover.update(STEP_MS / 2);
    expect(mover.x).toBeCloseTo(0.5);
    mover.update(STEP_MS / 2);
    expect(mover.x).toBe(1);
    // A animação segura um pouco esperando o próximo passo, que vem no tick seguinte.
    expect(mover.moving).toBe(true);
    mover.update(200);
    expect(mover.moving).toBe(false);
  });

  it('dois passos na fila (jitter do tick) andam na velocidade normal', () => {
    const mover = new Mover(0, 0);
    mover.push(1, 0);
    mover.push(2, 0);
    mover.update(STEP_MS);
    expect(mover.x).toBe(1);
  });

  it('fila acima de dois passos acelera para não acumular atraso', () => {
    const mover = new Mover(0, 0);
    mover.push(1, 0);
    mover.push(2, 0);
    mover.push(3, 0);
    mover.update(2.5 * STEP_MS);
    expect(mover.x).toBe(3);
  });

  it('correção de até um tile desliza; maior que isso teleporta', () => {
    const mover = new Mover(3, 0);
    mover.correct(2, 0);
    expect(mover.x).toBe(3);
    mover.update(STEP_MS);
    expect(mover.x).toBe(2);
    mover.correct(8, 8);
    expect([mover.x, mover.y]).toEqual([8, 8]);
  });

  it('em ritmo constante fica no máximo um passo atrás', () => {
    const mover = new Mover(0, 0);
    for (let i = 1; i <= 20; i++) {
      mover.push(i, 0);
      mover.update(STEP_MS * 0.8);
      mover.update(STEP_MS * 0.2);
      expect(i - mover.x).toBeLessThan(1);
    }
  });

  it('salto maior que um tile vira teleporte', () => {
    const mover = new Mover(0, 0);
    mover.push(5, 5);
    expect([mover.x, mover.y, mover.moving]).toEqual([5, 5, false]);
  });
});
