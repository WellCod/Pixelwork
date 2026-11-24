import type { PongDir, PongEvent, PongSide, PongState } from './pong.ts';

export const FOOSBALL = {
  WIDTH: 160,
  HEIGHT: 90,
  INSET: 4,
  GOAL_TOP: 29,
  GOAL_BOTTOM: 61,
  BALL_RADIUS: 2,
  FIGURE_RADIUS: 4,
  SLIDE: 17,
  SPEED: 84,
  KICK_RANGE: 8,
  KICK_WINDOW_MS: 140,
  KICK_COOLDOWN_MS: 400,
  WIN: 5,
} as const;

export interface FoosballRod {
  x: number;
  side: PongSide;
  offsets: readonly number[];
}

/** Goleiro, defesa e ataque de cada lado. A ordem segue o campo da esquerda para a direita. */
export const FOOSBALL_RODS: readonly FoosballRod[] = [
  { x: 15, side: 'left', offsets: [0] },
  { x: 33, side: 'left', offsets: [-12, 12] },
  { x: 55, side: 'right', offsets: [-19, 0, 19] },
  { x: 105, side: 'left', offsets: [-19, 0, 19] },
  { x: 127, side: 'right', offsets: [-12, 12] },
  { x: 145, side: 'right', offsets: [0] },
];

type Sides<T> = Record<PongSide, T>;
const SIDES = ['left', 'right'] as const;
const CENTER_Y = FOOSBALL.HEIGHT / 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const centeredBall = () => ({ x: FOOSBALL.WIDTH / 2, y: CENTER_Y, vx: 0, vy: 0 });

export interface FoosballState extends Pick<PongState, 'phase' | 'at' | 'serveAt' | 'ball' | 'score'> {
  /** Centro da haste, compartilhado pelas três hastes de cada time. */
  rods: Sides<number>;
  kickAt: Sides<number | null>;
  kickUsed: Sides<boolean>;
}

export interface FoosballInput {
  dir: PongDir;
  kick: boolean;
}

function resetKick() {
  return { kickAt: { left: null, right: null }, kickUsed: { left: false, right: false } };
}

export function newFoosball(now: number): FoosballState {
  return {
    phase: 'countdown', at: now, serveAt: now + 3000,
    ball: centeredBall(), rods: { left: CENTER_Y, right: CENTER_Y }, score: { left: 0, right: 0 },
    ...resetKick(),
  };
}

export function resumeFoosball(state: FoosballState, now: number): FoosballState {
  return { ...state, phase: 'countdown', at: now, serveAt: now + 3000, ball: centeredBall(), ...resetKick() };
}

export function foosballKicking(kickAt: number | null, now: number): boolean {
  return kickAt !== null && now - kickAt < FOOSBALL.KICK_WINDOW_MS;
}

export function stepFoosball(
  state: FoosballState, inputs: Sides<FoosballInput>, now: number,
): { state: FoosballState; events: PongEvent[] } {
  if (state.phase === 'paused' || state.phase === 'ended') return { state, events: [] };
  const elapsed = clamp(now - state.at, 0, 100);
  const next: FoosballState = {
    ...state, at: now, ball: { ...state.ball }, score: { ...state.score }, rods: { ...state.rods },
    kickAt: { ...state.kickAt }, kickUsed: { ...state.kickUsed },
  };
  const events: PongEvent[] = [];
  if (state.phase === 'countdown') {
    if (now >= state.serveAt) {
      const direction = (next.score.left + next.score.right) % 2 === 0 ? 1 : -1;
      next.phase = 'playing';
      next.ball.vx = direction * 61;
      next.ball.vy = direction * 24;
    }
  } else {
    for (const side of SIDES) {
      const last = next.kickAt[side];
      if (inputs[side].kick && (last === null || now - last >= FOOSBALL.KICK_COOLDOWN_MS)) {
        next.kickAt[side] = now;
        next.kickUsed[side] = false;
      }
    }
  }

  // Passos pequenos mantêm a bola e os bonecos consistentes mesmo num quadro atrasado.
  const steps = Math.max(1, Math.ceil(elapsed / 8));
  const dt = elapsed / steps / 1000;
  for (let step = 0; step < steps; step++) {
    for (const side of SIDES) {
      next.rods[side] = clamp(next.rods[side] + inputs[side].dir * FOOSBALL.SPEED * dt,
        CENTER_Y - FOOSBALL.SLIDE, CENTER_Y + FOOSBALL.SLIDE);
    }
    if (state.phase === 'playing' && moveBall(next, now, dt, events)) break;
  }
  return { state: next, events };
}

/** Devolve true quando um gol encerra o lance. */
function moveBall(state: FoosballState, now: number, dt: number, events: PongEvent[]): boolean {
  const ball = state.ball;
  const oldX = ball.x;
  const edge = FOOSBALL.INSET + FOOSBALL.BALL_RADIUS;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  if (ball.y < edge || ball.y > FOOSBALL.HEIGHT - edge) {
    ball.y = clamp(ball.y, edge, FOOSBALL.HEIGHT - edge);
    ball.vy = -ball.vy;
    events.push({ type: 'wall' });
  }

  for (const rod of FOOSBALL_RODS) {
    const crossed = ball.vx > 0 ? oldX < rod.x && ball.x >= rod.x : oldX > rod.x && ball.x <= rod.x;
    const canKick = !state.kickUsed[rod.side] && foosballKicking(state.kickAt[rod.side], now)
      && Math.abs(ball.x - rod.x) <= FOOSBALL.KICK_RANGE;
    if (!crossed && !canKick) continue;
    const figure = rod.offsets.find((offset) =>
      Math.abs(ball.y - state.rods[rod.side] - offset) <= FOOSBALL.FIGURE_RADIUS + FOOSBALL.BALL_RADIUS);
    if (figure === undefined) continue;
    const hitOffset = ball.y - state.rods[rod.side] - figure;
    const direction = canKick ? (rod.side === 'left' ? 1 : -1) : -Math.sign(ball.vx);
    ball.x = rod.x + direction * (canKick ? FOOSBALL.KICK_RANGE + 0.1 : 0.1);
    ball.vx = direction * (canKick ? 165 : Math.max(47, Math.abs(ball.vx) * 0.78));
    const angle = hitOffset * (canKick ? 13 : 8);
    ball.vy = clamp(!canKick && Math.abs(angle) < 8 ? (angle < 0 ? -12 : 12) : angle, -75, 75);
    if (canKick) state.kickUsed[rod.side] = true;
    events.push({ type: 'hit', side: rod.side });
    break;
  }

  if (ball.x >= edge && ball.x <= FOOSBALL.WIDTH - edge) return false;
  if (ball.y < FOOSBALL.GOAL_TOP + FOOSBALL.BALL_RADIUS || ball.y > FOOSBALL.GOAL_BOTTOM - FOOSBALL.BALL_RADIUS) {
    ball.x = clamp(ball.x, edge, FOOSBALL.WIDTH - edge);
    ball.vx = -ball.vx;
    events.push({ type: 'wall' });
    return false;
  }

  const scorer = ball.x < edge ? 'right' : 'left';
  state.score[scorer]++;
  events.push({ type: 'point', side: scorer });
  if (state.score[scorer] === FOOSBALL.WIN) {
    state.phase = 'ended';
    events.push({ type: 'end', winner: scorer });
  } else {
    state.phase = 'countdown';
    state.serveAt = now + 1500;
    state.ball = centeredBall();
    Object.assign(state, resetKick());
  }
  return true;
}

/** O bot tenta posicionar o boneco mais próximo de uma interceptação e chuta ao alcance. */
export function foosballBotInput(state: FoosballState, side: PongSide): FoosballInput {
  if (state.phase !== 'playing') return { dir: 0, kick: false };
  const { ball } = state;
  let target = CENTER_Y;
  let best = Infinity;
  let kick = false;
  for (const rod of FOOSBALL_RODS) {
    if (rod.side !== side) continue;
    const arrival = (rod.x - ball.x) / ball.vx;
    const close = Math.abs(rod.x - ball.x) <= FOOSBALL.KICK_RANGE;
    if (!close && (arrival < 0 || arrival > 0.55)) continue;
    for (const offset of rod.offsets) {
      kick ||= close && Math.abs(ball.y - state.rods[side] - offset) <= FOOSBALL.FIGURE_RADIUS;
      const predictedY = ball.y + ball.vy * (close ? 0 : arrival);
      const candidate = clamp(predictedY - offset, CENTER_Y - FOOSBALL.SLIDE, CENTER_Y + FOOSBALL.SLIDE);
      const cost = (close ? 0 : arrival * 14) + Math.abs(predictedY - candidate - offset) * 2
        + Math.abs(state.rods[side] - candidate) * 0.35;
      if (cost >= best) continue;
      best = cost;
      target = candidate;
    }
  }
  const delta = target - state.rods[side];
  return { dir: Math.abs(delta) <= 3 ? 0 : delta > 0 ? 1 : -1, kick };
}
