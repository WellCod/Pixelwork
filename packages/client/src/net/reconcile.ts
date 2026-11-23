import { DIR_DELTA, isWalkable, type CompiledMap, type Dir } from '@pixelwork/shared';

export interface Pos {
  x: number;
  y: number;
  dir: Dir;
}

export interface PendingMove {
  seq: number;
  dir: Dir;
}

/** Regra extra da predição (sala trancada); a mesma ideia do `canEnter` do servidor. */
export type CanEnter = (from: { x: number; y: number }, x: number, y: number) => boolean;

/** Predição de um passo: anda se o tile for caminhável (e liberado), senão só vira. */
export function predictStep(pos: Pos, dir: Dir, map: CompiledMap, canEnter?: CanEnter): Pos {
  const [dx, dy] = DIR_DELTA[dir];
  const x = pos.x + dx;
  const y = pos.y + dy;
  const allowed = isWalkable(map, x, y) && (canEnter?.(pos, x, y) ?? true);
  return allowed ? { x, y, dir } : { ...pos, dir };
}

/**
 * Parte da posição autoritativa e reaplica os passos que o servidor ainda não confirmou.
 * Os passos com `seq <= ack` saem da fila. Se o resultado bate com a predição, o avatar não se
 * mexe; se diverge (outro jogador no caminho, sala trancada), quem chama corrige a posição.
 */
export function reconcile(
  authoritative: Pos,
  ack: number,
  pending: readonly PendingMove[],
  map: CompiledMap,
  canEnter?: CanEnter,
): { pos: Pos; pending: PendingMove[] } {
  const remaining = pending.filter((move) => move.seq > ack);
  const pos = remaining.reduce((current, move) => predictStep(current, move.dir, map, canEnter), authoritative);
  return { pos, pending: remaining };
}
