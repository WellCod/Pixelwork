// Previsão do pingpong no cliente: a própria raquete responde na hora e a bola anda entre um
// estado do servidor e o próximo. Tudo no relógio do cliente, a partir da chegada do estado.
import { PONG, type PongDir, type PongState } from '@pixelwork/shared';

const MIN_Y = PONG.PADDLE_H / 2;
const MAX_Y = PONG.H - PONG.PADDLE_H / 2;
const HALF_BALL = PONG.BALL / 2;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface PendingGameInput {
  seq: number;
  dir: PongDir;
  /** Hora local do envio. */
  at: number;
}

/**
 * Raquete própria: parte do y do servidor (que já inclui os inputs até o ack), segue a direção
 * confirmada desde a chegada do estado e aplica cada input pendente a partir do momento dele.
 */
export function predictPaddle(
  serverY: number,
  ackedDir: PongDir,
  pending: readonly PendingGameInput[],
  receivedAt: number,
  now: number,
): number {
  let y = serverY;
  let dir: PongDir = ackedDir;
  let t = receivedAt;
  for (const input of pending) {
    const at = clamp(input.at, t, now);
    y = clamp(y + dir * PONG.PADDLE_SPEED * ((at - t) / 1000), MIN_Y, MAX_Y);
    dir = input.dir;
    t = at;
  }
  return clamp(y + dir * PONG.PADDLE_SPEED * ((now - t) / 1000), MIN_Y, MAX_Y);
}

/** Bola andando pela velocidade, refletindo nas paredes; para nas linhas de fundo. */
export function extrapolateBall(ball: PongState['ball'], receivedAt: number, now: number): { x: number; y: number } {
  const dt = Math.max(0, now - receivedAt) / 1000;
  const x = clamp(ball.x + ball.vx * dt, 0, PONG.W);
  let y = ball.y + ball.vy * dt;
  const span = PONG.H - 2 * HALF_BALL;
  // Reflete quantas vezes for preciso: dobra a posição no intervalo [HALF_BALL, H - HALF_BALL].
  let rel = (y - HALF_BALL) % (2 * span);
  if (rel < 0) rel += 2 * span;
  y = HALF_BALL + (rel > span ? 2 * span - rel : rel);
  return { x, y };
}
