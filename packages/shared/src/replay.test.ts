import { describe, expect, it } from 'vitest';
import { MIN_STEP_INTERVAL_MS } from './constants.ts';
import { compileMap, type CompiledMap } from './map.ts';
import { Recorder, replay } from './replay.ts';
import { step, type WorldState } from './sim.ts';
import { buildTestMap } from './testing.ts';

function testMap(): CompiledMap {
  const result = compileMap(buildTestMap({ spawns: [[1, 1]] }));
  if (!result.ok) throw new Error('fixture');
  return result.map;
}

describe('replay', () => {
  it('reproduz os passos gravados e chega ao mesmo estado do step direto', () => {
    const map = testMap();
    const recorder = new Recorder(100, 1, 0);
    let world: WorldState = { players: new Map([['a', { x: 1, y: 1, dir: 'down', lastStepAt: -Infinity }]]) };
    recorder.push({ t: 0, type: 'join', id: 'a', x: 1, y: 1, dir: 'down' });
    const dirs = ['down', 'right', 'right', 'up', 'left'] as const;
    dirs.forEach((dir, i) => {
      const t = (i + 1) * MIN_STEP_INTERVAL_MS;
      world = step(world, [{ playerId: 'a', seq: i + 1, dir }], t, map).state;
      recorder.push({ t, type: 'step', id: 'a', dir });
    });
    const frames: number[] = [];
    const replayed = replay(map, recorder.current, (frame) => frames.push(frame.t));
    expect(replayed.players.get('a')).toMatchObject({ x: world.players.get('a')?.x, y: world.players.get('a')?.y });
    expect(frames).toHaveLength(6);
  });

  it('gravador cheio pede restart, e o restart começa do retrato atual', () => {
    const recorder = new Recorder(2, 1, 0);
    expect(recorder.push({ t: 0, type: 'join', id: 'a', x: 1, y: 1, dir: 'down' })).toBe(true);
    expect(recorder.push({ t: 1, type: 'step', id: 'a', dir: 'down' })).toBe(false);
    recorder.restart(
      2,
      5,
      new Map([['a', { x: 1, y: 2, dir: 'down', lastStepAt: 1 }]]),
      new Map([['sala', { locked: true, allowed: new Set(['a']) }]]),
    );
    expect(recorder.current).toEqual({
      mapVersion: 2,
      startedAt: 5,
      events: [
        { t: 5, type: 'join', id: 'a', x: 1, y: 2, dir: 'down' },
        { t: 5, type: 'lock', zoneKey: 'sala', locked: true, allowed: ['a'] },
      ],
    });
  });
});
