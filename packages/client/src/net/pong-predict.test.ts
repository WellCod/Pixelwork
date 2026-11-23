import { describe, expect, it } from 'vitest';
import { extrapolateBall, predictPaddle } from './pong-predict.ts';

describe('predictPaddle', () => {
  it('parado sem inputs pendentes fica onde o servidor disse', () => {
    expect(predictPaddle(45, 0, [], 1000, 1500)).toBe(45);
  });

  it('segue a direção confirmada desde a chegada do estado', () => {
    expect(predictPaddle(45, 1, [], 1000, 1100)).toBeCloseTo(57, 5);
  });

  it('aplica os pendentes a partir do momento de cada um', () => {
    // Desce 100 ms, depois sobe 50 ms: 45 + 12 - 6.
    const pending = [
      { seq: 3, dir: 1 as const, at: 1000 },
      { seq: 4, dir: -1 as const, at: 1100 },
    ];
    expect(predictPaddle(45, 0, pending, 1000, 1150)).toBeCloseTo(51, 5);
  });

  it('input enviado antes da chegada do estado conta a partir da chegada', () => {
    expect(predictPaddle(45, 0, [{ seq: 2, dir: 1, at: 900 }], 1000, 1100)).toBeCloseTo(57, 5);
  });

  it('fica presa ao campo', () => {
    expect(predictPaddle(80, 1, [], 0, 1000)).toBe(81);
    expect(predictPaddle(10, -1, [], 0, 1000)).toBe(9);
  });
});

describe('extrapolateBall', () => {
  it('anda pela velocidade desde a chegada', () => {
    expect(extrapolateBall({ x: 80, y: 45, vx: 100, vy: 0 }, 1000, 1100)).toEqual({ x: 90, y: 45 });
  });

  it('reflete na parede de cima', () => {
    const p = extrapolateBall({ x: 80, y: 5, vx: 0, vy: -100 }, 0, 100);
    expect(p.y).toBeCloseTo(8, 5);
  });

  it('para na linha de fundo: o ponto quem decide é o servidor', () => {
    expect(extrapolateBall({ x: 155, y: 45, vx: 200, vy: 0 }, 0, 500).x).toBe(160);
    expect(extrapolateBall({ x: 5, y: 45, vx: -200, vy: 0 }, 0, 500).x).toBe(0);
  });
});
