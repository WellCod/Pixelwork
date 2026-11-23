import { compileMap, type CompiledMap } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { describe, expect, it } from 'vitest';
import { predictStep, reconcile } from './reconcile.ts';

function testMap(): CompiledMap {
  const result = compileMap(buildTestMap({ spawns: [[1, 1]] }));
  if (!result.ok) throw new Error('fixture inválida');
  return result.map;
}

const map = testMap();

describe('reconcile', () => {
  it('faz snap na posição autoritativa e reaplica só os passos com seq > ack', () => {
    const result = reconcile(
      { x: 1, y: 1, dir: 'down' },
      2,
      [
        { seq: 1, dir: 'right' },
        { seq: 2, dir: 'right' },
        { seq: 3, dir: 'down' },
        { seq: 4, dir: 'down' },
      ],
      map,
    );
    expect(result.pos).toEqual({ x: 1, y: 3, dir: 'down' });
    expect(result.pending.map((move) => move.seq)).toEqual([3, 4]);
  });

  it('sem passos pendentes fica na posição autoritativa', () => {
    expect(reconcile({ x: 4, y: 2, dir: 'left' }, 7, [{ seq: 7, dir: 'up' }], map).pos).toEqual({
      x: 4,
      y: 2,
      dir: 'left',
    });
  });

  it('reaplica respeitando paredes', () => {
    const result = reconcile({ x: 1, y: 1, dir: 'down' }, 0, [{ seq: 1, dir: 'up' }, { seq: 2, dir: 'right' }], map);
    expect(result.pos).toEqual({ x: 2, y: 1, dir: 'right' });
  });
});

describe('predictStep', () => {
  it('vira sem andar contra a parede', () => {
    expect(predictStep({ x: 1, y: 1, dir: 'down' }, 'left', map)).toEqual({ x: 1, y: 1, dir: 'left' });
  });
});

describe('predictStep com regra de entrada', () => {
  it('não prevê entrada num tile recusado pela regra (sala trancada), só vira', () => {
    const blocked = (_from: unknown, x: number) => x !== 2;
    expect(predictStep({ x: 1, y: 1, dir: 'down' }, 'right', map, blocked)).toEqual({ x: 1, y: 1, dir: 'right' });
    expect(predictStep({ x: 1, y: 1, dir: 'down' }, 'down', map, blocked)).toEqual({ x: 1, y: 2, dir: 'down' });
  });
});
