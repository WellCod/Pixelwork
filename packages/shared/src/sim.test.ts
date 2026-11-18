import { describe, expect, it } from 'vitest';
import { MIN_STEP_INTERVAL_MS } from './constants.ts';
import { compileMap, type CompiledMap } from './map.ts';
import { step, type SimPlayer, type WorldState } from './sim.ts';
import { buildTestMap } from './testing.ts';

function testMap(): CompiledMap {
  const result = compileMap(buildTestMap({ spawns: [[1, 1]] }));
  if (!result.ok) throw new Error('fixture inválida');
  return result.map;
}

const map = testMap();

function world(player: Partial<SimPlayer> = {}): WorldState {
  return { players: new Map([['a', { x: 1, y: 1, dir: 'down', lastStepAt: -Infinity, ...player }]]) };
}

describe('step', () => {
  it('anda para tile caminhável', () => {
    const { state, events } = step(world(), [{ playerId: 'a', seq: 1, dir: 'right' }], 1000, map);
    expect(state.players.get('a')).toEqual({ x: 2, y: 1, dir: 'right', lastStepAt: 1000 });
    expect(events).toEqual([{ type: 'moved', id: 'a', x: 2, y: 1, dir: 'right' }]);
  });

  it('ignora passo dentro do intervalo mínimo', () => {
    const before = world({ lastStepAt: 1000 });
    const { state, events } = step(
      before,
      [{ playerId: 'a', seq: 2, dir: 'right' }],
      1000 + MIN_STEP_INTERVAL_MS - 1,
      map,
    );
    expect(state).toBe(before);
    expect(events).toEqual([]);
  });

  it('aceita o passo exatamente no intervalo mínimo', () => {
    const { events } = step(
      world({ lastStepAt: 1000 }),
      [{ playerId: 'a', seq: 2, dir: 'right' }],
      1000 + MIN_STEP_INTERVAL_MS,
      map,
    );
    expect(events).toHaveLength(1);
  });

  it('recusa passo para parede e só vira o jogador', () => {
    const { state, events } = step(world(), [{ playerId: 'a', seq: 1, dir: 'up' }], 1000, map);
    expect(state.players.get('a')).toMatchObject({ x: 1, y: 1, dir: 'up' });
    expect(events).toEqual([{ type: 'blocked', id: 'a', x: 1, y: 1, dir: 'up' }]);
  });

  it('dois inputs no mesmo instante aplicam só o primeiro', () => {
    const { state } = step(
      world(),
      [
        { playerId: 'a', seq: 1, dir: 'right' },
        { playerId: 'a', seq: 2, dir: 'right' },
      ],
      1000,
      map,
    );
    expect(state.players.get('a')?.x).toBe(2);
  });

  it('respeita a regra de entrada do ponto de extensão', () => {
    const { events } = step(world(), [{ playerId: 'a', seq: 1, dir: 'right' }], 1000, map, {
      canEnter: () => false,
    });
    expect(events[0]?.type).toBe('blocked');
  });

  it('não altera o estado recebido', () => {
    const before = world();
    step(before, [{ playerId: 'a', seq: 1, dir: 'right' }], 1000, map);
    expect(before.players.get('a')?.x).toBe(1);
  });
});
