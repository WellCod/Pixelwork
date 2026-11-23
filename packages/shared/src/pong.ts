// Física do pingpong (docs/superpowers/specs/2026-11-22-pingpong-design.md): módulo puro, com o
// relógio injetado. O servidor avança a partida quadro a quadro; o cliente só desenha.

export type PongSide = 'left' | 'right';
/** Comando da raquete: -1 sobe, 0 parada, 1 desce. */
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

/**
 * Medidas e ritmo da partida. Distâncias em unidades do campo (W x H, y cresce para baixo),
 * velocidades por segundo. `LEFT_X`/`RIGHT_X` são as bordas esquerdas das raquetes, `BALL` o lado
 * da bola, `SPEEDUP` o fator a cada rebatida (até `BALL_MAX`) e `WIN` os pontos para vencer.
 */
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

const opponentOf = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Bola parada no centro do campo. */
const centeredBall = () => ({ x: PONG.W / 2, y: PONG.H / 2, vx: 0, vy: 0 });

/** Partida nova: placar zerado, raquetes no meio e contagem antes do primeiro saque (da esquerda). */
export function newPong(now: number): PongState {
  return {
    phase: 'countdown',
    at: now,
    serveAt: now + PONG.COUNTDOWN_MS,
    ball: centeredBall(),
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
  return { ...state, phase: 'countdown', at: now, serveAt: now + PONG.COUNTDOWN_MS, ball: centeredBall() };
}

/**
 * Avança a partida até `now` com os comandos das duas raquetes. Puro: devolve o estado novo e os
 * eventos do quadro (rebatida, parede, ponto, fim) para o servidor repassar aos jogadores.
 */
export function stepPong(
  state: PongState,
  inputs: { left: PongDir; right: PongDir },
  now: number,
): { state: PongState; events: PongEvent[] } {
  const dt = clamp(now - state.at, 0, MAX_DT_MS) / 1000;
  // Cópia dos objetos aninhados que este quadro altera; o estado recebido fica intacto.
  const next: PongState = { ...state, at: now, ball: { ...state.ball }, paddles: { ...state.paddles }, score: { ...state.score } };
  const events: PongEvent[] = [];
  if (next.phase === 'ended' || next.phase === 'paused') return { state: next, events };

  const movePaddle = (paddleY: number, dir: PongDir) =>
    clamp(paddleY + dir * PONG.PADDLE_SPEED * dt, HALF_PADDLE, PONG.H - HALF_PADDLE);
  next.paddles.left = movePaddle(next.paddles.left, inputs.left);
  next.paddles.right = movePaddle(next.paddles.right, inputs.right);

  // Na contagem as raquetes já andam, mas a bola só sai no `serveAt`.
  if (next.phase === 'countdown') {
    if (now >= next.serveAt) {
      const verticalSign = (next.score.left + next.score.right) % 2 === 0 ? 1 : -1;
      const horizontalSign = next.servingSide === 'left' ? 1 : -1;
      next.phase = 'playing';
      next.ball = {
        ...centeredBall(),
        vx: horizontalSign * PONG.BALL_SPEED * Math.cos(SERVE_ANGLE),
        vy: verticalSign * PONG.BALL_SPEED * Math.sin(SERVE_ANGLE),
      };
    }
    return { state: next, events };
  }

  const previousBall = next.ball;
  let x = previousBall.x + previousBall.vx * dt;
  let y = previousBall.y + previousBall.vy * dt;
  let { vx, vy } = previousBall;

  // Parede de cima ou de baixo: espelha o que passou da borda e inverte vy.
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
    const isLeft = side === 'left';
    // Borda da bola que bate na raquete, antes e depois do movimento deste quadro.
    const edgeBefore = isLeft ? previousBall.x - HALF_BALL : previousBall.x + HALF_BALL;
    const edgeAfter = isLeft ? x - HALF_BALL : x + HALF_BALL;
    const face = isLeft ? LEFT_FACE : RIGHT_FACE;
    const crossed = isLeft ? vx < 0 && edgeBefore >= face && edgeAfter < face : vx > 0 && edgeBefore <= face && edgeAfter > face;
    if (!crossed) return false;
    // Fração do quadro em que a borda cruzou a face, para achar o y da bola nesse instante.
    const crossFraction = (edgeBefore - face) / (edgeBefore - edgeAfter);
    const yCross = clamp(previousBall.y + (y - previousBall.y) * crossFraction, HALF_BALL, PONG.H - HALF_BALL);
    const paddleY = next.paddles[side];
    if (Math.abs(yCross - paddleY) > HALF_PADDLE + HALF_BALL) return false;
    // Onde bateu na raquete, de -1 (ponta de cima) a 1 (ponta de baixo), vira o ângulo de saída.
    const relativeHit = clamp((yCross - paddleY) / (HALF_PADDLE + HALF_BALL), -1, 1);
    const angle = (relativeHit * PONG.MAX_ANGLE_DEG * Math.PI) / 180;
    const speed = Math.min(PONG.BALL_MAX, Math.hypot(vx, vy) * PONG.SPEEDUP);
    vx = (isLeft ? 1 : -1) * speed * Math.cos(angle);
    vy = speed * Math.sin(angle);
    // A bola sai encostada na face, do lado de fora da raquete.
    x = isLeft ? face + HALF_BALL : face - HALF_BALL;
    y = yCross;
    events.push({ type: 'hit', side });
    return true;
  };
  if (!hit('left')) hit('right');

  next.ball = { x, y, vx, vy };

  // Centro da bola fora do campo: ponto de quem está do outro lado.
  const scorer: PongSide | null = x < 0 ? 'right' : x > PONG.W ? 'left' : null;
  if (scorer) {
    next.score[scorer] += 1;
    events.push({ type: 'point', side: scorer });
    next.firstLoser ??= opponentOf(scorer);
    if (next.score[scorer] >= PONG.WIN) {
      next.phase = 'ended';
      next.ball = centeredBall();
      events.push({ type: 'end', winner: scorer });
    } else {
      // Saque em blocos de 2 pontos: pontos 1-2 saca quem perdeu o primeiro, 3-4 o outro, e assim por diante.
      const totalPoints = next.score.left + next.score.right;
      next.servingSide = Math.floor((totalPoints - 1) / 2) % 2 === 0 ? next.firstLoser : opponentOf(next.firstLoser);
      next.phase = 'countdown';
      next.serveAt = now + PONG.COUNTDOWN_MS;
      next.ball = centeredBall();
    }
  }
  return { state: next, events };
}

/** Bot do modo solo: segue a bola quando ela vem na direção dele, senão volta ao meio. */
export function botInput(state: PongState, side: PongSide): PongDir {
  const ballComing = side === 'right' ? state.ball.vx > 0 : state.ball.vx < 0;
  const targetY = ballComing ? state.ball.y : PONG.H / 2;
  const offset = targetY - state.paddles[side];
  if (Math.abs(offset) <= BOT_DEAD_ZONE) return 0;
  return offset > 0 ? 1 : -1;
}
