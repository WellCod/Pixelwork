import { describe, expect, it } from 'vitest';
import { PONG, botInput, newPong, pausePong, resumePong, stepPong, type PongDir, type PongEvent, type PongState } from './pong.ts';

const idle = { left: 0, right: 0 } as const;

/** Estado em jogo, com a bola e as raquetes onde o teste mandar. */
function playing(over: Partial<PongState> & { ball?: Partial<PongState['ball']> }): PongState {
  const base = newPong(0);
  return {
    ...base,
    ...over,
    phase: 'playing',
    at: 0,
    serveAt: 0,
    ball: { x: 80, y: 45, vx: 0, vy: 0, ...over.ball },
  };
}

/** Roda quadros até `until` ms, juntando os eventos. */
function run(state: PongState, until: number, inputs: { left: PongDir; right: PongDir } = idle) {
  const events: PongEvent[] = [];
  let s = state;
  for (let t = s.at + PONG.FRAME_MS; t <= until + 1e-9; t += PONG.FRAME_MS) {
    const out = stepPong(s, inputs, t);
    s = out.state;
    events.push(...out.events);
  }
  return { state: s, events };
}

const frame = (s: PongState, inputs: { left: PongDir; right: PongDir } = idle) => stepPong(s, inputs, s.at + PONG.FRAME_MS);

describe('stepPong', () => {
  it('contagem segura a bola e solta no serveAt', () => {
    const waiting = run(newPong(0), 2900).state;
    expect(waiting.phase).toBe('countdown');
    expect(waiting.ball).toMatchObject({ x: 80, y: 45 });
    const served = stepPong(waiting, idle, 3000).state;
    expect(served.phase).toBe('playing');
    expect(served.ball.vx).toBeGreaterThan(0);
  });

  it('raquete anda 120 u/s e para nas bordas', () => {
    const half = run(playing({}), 100, { left: 1, right: 0 }).state;
    expect(half.paddles.left).toBeCloseTo(45 + 12, 5);
    const end = run(playing({}), 1000, { left: 1, right: -1 }).state;
    expect(end.paddles.left).toBe(81);
    expect(end.paddles.right).toBe(9);
  });

  it('rebate no meio volta reta e acelera 6%', () => {
    const { state, events } = frame(playing({ ball: { x: 12, y: 45, vx: -80, vy: 0 } }));
    expect(events).toContainEqual({ type: 'hit', side: 'left' });
    expect(state.ball.vx).toBeCloseTo(84.8, 5);
    expect(state.ball.vy).toBeCloseTo(0, 5);
  });

  it('rebate na ponta sai a 60 graus', () => {
    const { state } = frame(playing({ ball: { x: 12, y: 55.5, vx: -80, vy: 0 } }));
    const angle = (Math.atan2(Math.abs(state.ball.vy), state.ball.vx) * 180) / Math.PI;
    expect(angle).toBeCloseTo(60, 3);
    expect(state.ball.vy).toBeGreaterThan(0);
  });

  it('bola a 200 u/s não atravessa a raquete', () => {
    const { state, events } = frame(playing({ ball: { x: 14, y: 45, vx: -200, vy: 0 } }));
    expect(events).toContainEqual({ type: 'hit', side: 'left' });
    expect(state.ball.vx).toBeGreaterThan(0);
    expect(state.ball.x).toBeGreaterThanOrEqual(10.5);
  });

  it('velocidade não passa do teto', () => {
    const { state } = frame(playing({ ball: { x: 14, y: 45, vx: -199, vy: 0 } }));
    expect(Math.hypot(state.ball.vx, state.ball.vy)).toBeCloseTo(PONG.BALL_MAX, 5);
  });

  it('parede reflete vy', () => {
    const { state, events } = frame(playing({ ball: { x: 80, y: 2, vx: 0, vy: -60 } }));
    expect(events).toContainEqual({ type: 'wall' });
    expect(state.ball.vy).toBe(60);
    expect(state.ball.y).toBeGreaterThanOrEqual(1.5);
  });

  it('ponto e saque alternado a cada 2', () => {
    // A bola sai pela esquerda: ponto da direita; quem sofreu o primeiro (esquerda) saca primeiro.
    const lose = (s: PongState, side: 'left' | 'right') =>
      frame({ ...s, phase: 'playing', ball: { x: side === 'left' ? -1 : 161, y: 45, vx: side === 'left' ? -80 : 80, vy: 0 } });
    let s = playing({});
    const serving: string[] = [];
    for (const side of ['left', 'right', 'left', 'right', 'left'] as const) {
      const out = lose(s, side);
      expect(out.events).toContainEqual({ type: 'point', side: side === 'left' ? 'right' : 'left' });
      s = out.state;
      expect(s.phase).toBe('countdown');
      serving.push(s.servingSide);
    }
    expect(serving).toEqual(['left', 'left', 'right', 'right', 'left']);
    expect(s.score).toEqual({ left: 2, right: 3 });
  });

  it('fim aos 7', () => {
    const s = playing({ score: { left: 6, right: 3 }, ball: { x: 161, y: 45, vx: 80, vy: 0 } });
    const { state, events } = frame(s);
    expect(events).toContainEqual({ type: 'end', winner: 'left' });
    expect(state.phase).toBe('ended');
    expect(state.score.left).toBe(PONG.WIN);
    expect(frame(state).state).toEqual({ ...state, at: state.at + PONG.FRAME_MS });
  });

  it('pausa e retomada voltam com contagem e bola no centro', () => {
    const paused = pausePong(playing({ ball: { x: 30, y: 20, vx: 50, vy: 10 } }));
    expect(paused.phase).toBe('paused');
    expect(frame(paused).state.ball).toEqual(paused.ball);
    const resumed = resumePong(paused, 5000);
    expect(resumed).toMatchObject({ phase: 'countdown', serveAt: 8000, at: 5000, ball: { x: 80, y: 45, vx: 0, vy: 0 } });
  });
});

describe('botInput', () => {
  it('bot devolve bola lenta e reta', () => {
    let s = playing({ ball: { x: 100, y: 45, vx: 80, vy: 0 } });
    const events: PongEvent[] = [];
    for (let i = 0; i < 40; i++) {
      const out = frame(s, { left: 0, right: botInput(s, 'right') });
      s = out.state;
      events.push(...out.events);
    }
    expect(events).toContainEqual({ type: 'hit', side: 'right' });
  });

  it('bot perde bola rápida longe da raquete', () => {
    let s = playing({ ball: { x: 130, y: 85, vx: 200, vy: 0 }, paddles: { left: 45, right: 9 } });
    const events: PongEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const out = frame(s, { left: 0, right: botInput(s, 'right') });
      s = out.state;
      events.push(...out.events);
    }
    expect(events).toContainEqual({ type: 'point', side: 'left' });
  });

  it('parado quando a bola vai para o outro lado e a raquete já está no meio', () => {
    expect(botInput(playing({ ball: { x: 80, y: 10, vx: -80, vy: 0 } }), 'right')).toBe(0);
    expect(botInput(playing({ ball: { x: 80, y: 10, vx: 80, vy: 0 } }), 'right')).toBe(-1);
  });
});
