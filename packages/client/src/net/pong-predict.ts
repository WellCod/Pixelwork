// Previsão do pingpong no cliente: a própria raquete responde na hora e a bola anda entre um
// estado do servidor e o próximo. Tudo no relógio do cliente, a partir da chegada do estado.
import { PONG, type PongDir, type PongState } from '@pixelwork/shared';

const MIN_Y = PONG.PADDLE_H / 2;
const MAX_Y = PONG.H - PONG.PADDLE_H / 2;
const HALF_BALL = PONG.BALL / 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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
  // Integra por trechos: cada trecho anda na direção vigente até o próximo input mudar ela.
  // Input enviado antes da chegada do estado conta a partir da chegada (o y do servidor já o inclui
  // até ali); nenhum passa de `now`.
  let y = serverY;
  let dir: PongDir = ackedDir;
  let segmentStart = receivedAt;
  for (const input of pending) {
    const inputAt = clamp(input.at, segmentStart, now);
    y = clamp(y + dir * PONG.PADDLE_SPEED * ((inputAt - segmentStart) / 1000), MIN_Y, MAX_Y);
    dir = input.dir;
    segmentStart = inputAt;
  }
  return clamp(y + dir * PONG.PADDLE_SPEED * ((now - segmentStart) / 1000), MIN_Y, MAX_Y);
}

/** Bola andando pela velocidade, refletindo nas paredes; para nas linhas de fundo. */
export function extrapolateBall(ball: PongState['ball'], receivedAt: number, now: number): { x: number; y: number } {
  const elapsedSeconds = Math.max(0, now - receivedAt) / 1000;
  const x = clamp(ball.x + ball.vx * elapsedSeconds, 0, PONG.W);
  let y = ball.y + ball.vy * elapsedSeconds;
  const span = PONG.H - 2 * HALF_BALL;
  // Reflete quantas vezes for preciso: dobra a posição no intervalo [HALF_BALL, H - HALF_BALL].
  // Num período de 2 * span a bola desce o vão inteiro e volta; a segunda metade é o espelho.
  let offset = (y - HALF_BALL) % (2 * span);
  if (offset < 0) offset += 2 * span;
  y = HALF_BALL + (offset > span ? 2 * span - offset : offset);
  return { x, y };
}
