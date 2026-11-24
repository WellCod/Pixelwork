import { describe, expect, it } from 'vitest';
import { FOOSBALL, foosballBotInput, newFoosball, resumeFoosball, stepFoosball, type FoosballState } from './foosball.ts';

const idle = { dir: 0, kick: false } as const;
const inputs = { left: idle, right: idle };

function playing(ball: FoosballState['ball']): FoosballState {
  return { ...newFoosball(0), phase: 'playing', ball };
}

describe('pebolim', () => {
  it('desliza as hastes de cada lado dentro dos limites durante a contagem', () => {
    let state = newFoosball(0);
    for (let now = 100; now <= 500; now += 100) {
      state = stepFoosball(state, { left: { ...idle, dir: 1 }, right: { ...idle, dir: -1 } }, now).state;
    }
    expect(state.rods).toEqual({ left: 62, right: 28 });
    expect(state.ball).toEqual(newFoosball(0).ball);
  });

  it('chuta com o boneco ao alcance, consome o chute e respeita o intervalo entre chutes', () => {
    const start = playing({ x: 101, y: 45, vx: 50, vy: 0 });
    const command = { ...inputs, left: { ...idle, kick: true } };
    const first = stepFoosball(start, command, 30);
    expect(first.state.ball.vx).toBeGreaterThan(100);
    expect(first.events).toContainEqual({ type: 'hit', side: 'left' });
    expect(first.state.kickUsed.left).toBe(true);
    const second = stepFoosball({ ...first.state, ball: start.ball }, command, 120);
    expect(second.state.kickAt.left).toBe(30);
    expect(second.state.ball.vx).toBeLessThan(0);
    expect(start.kickAt.left).toBeNull();
    expect(start.ball.x).toBe(101);
  });

  it('rebate fora da boca do gol e vence ao marcar o quinto gol', () => {
    const wall = stepFoosball(playing({ x: 153, y: 23, vx: 60, vy: 0 }), inputs, 30);
    expect(wall.state.score.left).toBe(0);
    expect(wall.state.ball.vx).toBeLessThan(0);
    const start = playing({ x: 153, y: 45, vx: 60, vy: 0 });
    const goal = stepFoosball(start, inputs, 30);
    expect(goal.state).toMatchObject({ phase: 'countdown', score: { left: 1, right: 0 }, ball: { x: 80, y: 45, vx: 0 } });
    const end = stepFoosball({ ...start, score: { left: FOOSBALL.WIN - 1, right: 0 } }, inputs, 30);
    expect(end.state).toMatchObject({ phase: 'ended', score: { left: 5, right: 0 } });
    expect(end.events).toEqual([{ type: 'point', side: 'left' }, { type: 'end', winner: 'left' }]);
  });

  it('o bot mira nas hastes do próprio lado e chuta quando pode alcançar a bola', () => {
    expect(foosballBotInput(playing({ x: 121, y: 61, vx: 40, vy: 0 }), 'right')).toEqual({ dir: 1, kick: true });
    expect(foosballBotInput(playing({ x: 64, y: 45, vx: 40, vy: 0 }), 'left').kick).toBe(false);
  });

  it('retoma com a bola no centro e preserva o placar após uma reconexão', () => {
    const state = { ...playing({ x: 100, y: 45, vx: 50, vy: 0 }), phase: 'paused', score: { left: 3, right: 2 } } as const;
    expect(stepFoosball(state, inputs, 9000).state).toBe(state);
    expect(resumeFoosball(state, 9000)).toMatchObject({ phase: 'countdown', serveAt: 12000, score: state.score, ball: { x: 80, y: 45, vx: 0 } });
  });
});
