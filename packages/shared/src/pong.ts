// Física do pingpong (docs/superpowers/specs/2026-11-22-pingpong-design.md): módulo puro, com o
// relógio injetado. O servidor avança a partida quadro a quadro; o cliente só desenha.

export type PongSide = 'left' | 'right';
export type PongDir = -1 | 0 | 1;
export type PongPhase = 'countdown' | 'playing' | 'paused' | 'ended';

export interface PongState {
  phase: PongPhase;
  /** Momento do último passo (ms). */
  at: number;
  /** Fim da contagem antes do saque (ms). */
  serveAt: number;
  /** Centro da bola e velocidade em unidades do campo por segundo. */
  ball: { x: number; y: number; vx: number; vy: number };
  /** Centro de cada raquete em y. */
  paddles: { left: number; right: number };
  score: { left: number; right: number };
  servingSide: PongSide;
  /** Quem sofreu o primeiro ponto: o saque alterna a cada 2 pontos a partir dele. */
  firstLoser: PongSide | null;
}

export type PongEvent =
  | { type: 'hit'; side: PongSide }
  | { type: 'wall' }
  | { type: 'point'; side: PongSide }
  | { type: 'end'; winner: PongSide };

export const PONG = {
  W: 160,
  H: 90,
  PADDLE_H: 18,
  PADDLE_W: 3,
  LEFT_X: 6,
  RIGHT_X: 151,
  BALL: 3,
  PADDLE_SPEED: 120,
  BALL_SPEED: 80,
  BALL_MAX: 200,
  SPEEDUP: 1.06,
  MAX_ANGLE_DEG: 60,
  FRAME_MS: 1000 / 30,
  COUNTDOWN_MS: 3000,
  WIN: 7,
} as const;

const HALF_BALL = PONG.BALL / 2;
const HALF_PADDLE = PONG.PADDLE_H / 2;
/** Faces das raquetes: a da esquerda olha para a direita e vice-versa. */
const LEFT_FACE = PONG.LEFT_X + PONG.PADDLE_W;
const RIGHT_FACE = PONG.RIGHT_X;
/** Ângulo do saque: alterna entre +20° e -20° pela paridade do placar. */
const SERVE_ANGLE = (20 * Math.PI) / 180;
/** Passo máximo: um servidor travado não teletransporta a bola. */
const MAX_DT_MS = 100;
/** Zona morta do bot: perto do alvo ele para, e assim erra bolas rápidas. */
const BOT_DEAD_ZONE = 6;

const other = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const center = () => ({ x: PONG.W / 2, y: PONG.H / 2, vx: 0, vy: 0 });

export function newPong(now: number): PongState {
  return {
    phase: 'countdown',
    at: now,
    serveAt: now + PONG.COUNTDOWN_MS,
    ball: center(),
    paddles: { left: PONG.H / 2, right: PONG.H / 2 },
    score: { left: 0, right: 0 },
    servingSide: 'left',
    firstLoser: null,
  };
}

export function pausePong(state: PongState): PongState {
  return { ...state, phase: 'paused' };
}

/** Volta de uma pausa: bola no centro e contagem nova, sem mexer no placar. */
export function resumePong(state: PongState, now: number): PongState {
  return { ...state, phase: 'countdown', at: now, serveAt: now + PONG.COUNTDOWN_MS, ball: center() };
}

export function stepPong(
  state: PongState,
  inputs: { left: PongDir; right: PongDir },
  now: number,
): { state: PongState; events: PongEvent[] } {
  const dt = clamp(now - state.at, 0, MAX_DT_MS) / 1000;
  const s: PongState = { ...state, at: now, ball: { ...state.ball }, paddles: { ...state.paddles }, score: { ...state.score } };
  const events: PongEvent[] = [];
  if (s.phase === 'ended' || s.phase === 'paused') return { state: s, events };

  const move = (y: number, dir: PongDir) => clamp(y + dir * PONG.PADDLE_SPEED * dt, HALF_PADDLE, PONG.H - HALF_PADDLE);
  s.paddles.left = move(s.paddles.left, inputs.left);
  s.paddles.right = move(s.paddles.right, inputs.right);

  if (s.phase === 'countdown') {
    if (now >= s.serveAt) {
      const sign = (s.score.left + s.score.right) % 2 === 0 ? 1 : -1;
      const dir = s.servingSide === 'left' ? 1 : -1;
      s.phase = 'playing';
      s.ball = {
        ...center(),
        vx: dir * PONG.BALL_SPEED * Math.cos(SERVE_ANGLE),
        vy: sign * PONG.BALL_SPEED * Math.sin(SERVE_ANGLE),
      };
    }
    return { state: s, events };
  }

  const prev = s.ball;
  let x = prev.x + prev.vx * dt;
  let y = prev.y + prev.vy * dt;
  let { vx, vy } = prev;

  if (y < HALF_BALL) {
    y = 2 * HALF_BALL - y;
    vy = -vy;
    events.push({ type: 'wall' });
  } else if (y > PONG.H - HALF_BALL) {
    y = 2 * (PONG.H - HALF_BALL) - y;
    vy = -vy;
    events.push({ type: 'wall' });
  }

  // Varredura: a bola pode andar mais que a espessura da raquete num quadro.
  const hit = (side: PongSide): boolean => {
    const left = side === 'left';
    const edgeBefore = left ? prev.x - HALF_BALL : prev.x + HALF_BALL;
    const edgeAfter = left ? x - HALF_BALL : x + HALF_BALL;
    const face = left ? LEFT_FACE : RIGHT_FACE;
    const crossed = left ? vx < 0 && edgeBefore >= face && edgeAfter < face : vx > 0 && edgeBefore <= face && edgeAfter > face;
    if (!crossed) return false;
    const t = (edgeBefore - face) / (edgeBefore - edgeAfter);
    const yCross = clamp(prev.y + (y - prev.y) * t, HALF_BALL, PONG.H - HALF_BALL);
    const paddle = s.paddles[side];
    if (Math.abs(yCross - paddle) > HALF_PADDLE + HALF_BALL) return false;
    const rel = clamp((yCross - paddle) / (HALF_PADDLE + HALF_BALL), -1, 1);
    const angle = (rel * PONG.MAX_ANGLE_DEG * Math.PI) / 180;
    const speed = Math.min(PONG.BALL_MAX, Math.hypot(vx, vy) * PONG.SPEEDUP);
    vx = (left ? 1 : -1) * speed * Math.cos(angle);
    vy = speed * Math.sin(angle);
    x = left ? face + HALF_BALL : face - HALF_BALL;
    y = yCross;
    events.push({ type: 'hit', side });
    return true;
  };
  if (!hit('left')) hit('right');

  s.ball = { x, y, vx, vy };

  const scorer: PongSide | null = x < 0 ? 'right' : x > PONG.W ? 'left' : null;
  if (scorer) {
    s.score[scorer] += 1;
    events.push({ type: 'point', side: scorer });
    s.firstLoser ??= other(scorer);
    if (s.score[scorer] >= PONG.WIN) {
      s.phase = 'ended';
      s.ball = center();
      events.push({ type: 'end', winner: scorer });
    } else {
      const total = s.score.left + s.score.right;
      s.servingSide = Math.floor((total - 1) / 2) % 2 === 0 ? s.firstLoser : other(s.firstLoser);
      s.phase = 'countdown';
      s.serveAt = now + PONG.COUNTDOWN_MS;
      s.ball = center();
    }
  }
  return { state: s, events };
}

/** Bot do modo solo: segue a bola quando ela vem na direção dele, senão volta ao meio. */
export function botInput(state: PongState, side: PongSide): PongDir {
  const coming = side === 'right' ? state.ball.vx > 0 : state.ball.vx < 0;
  const target = coming ? state.ball.y : PONG.H / 2;
  const diff = target - state.paddles[side];
  if (Math.abs(diff) <= BOT_DEAD_ZONE) return 0;
  return diff > 0 ? 1 : -1;
}
