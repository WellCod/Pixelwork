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

/** Predição de um passo: anda se o tile for caminhável, senão só vira. */
export function predictStep(pos: Pos, dir: Dir, map: CompiledMap): Pos {
  const [dx, dy] = DIR_DELTA[dir];
  const x = pos.x + dx;
  const y = pos.y + dy;
  return isWalkable(map, x, y) ? { x, y, dir } : { ...pos, dir };
}

/**
 * Parte da posição autoritativa e reaplica os passos que o servidor ainda não confirmou.
 * Os passos com `seq <= ack` saem da fila.
 */
export function reconcile(
  authoritative: Pos,
  ack: number,
  pending: readonly PendingMove[],
  map: CompiledMap,
): { pos: Pos; pending: PendingMove[] } {
  const remaining = pending.filter((p) => p.seq > ack);
  const pos = remaining.reduce((current, move) => predictStep(current, move.dir, map), authoritative);
  return { pos, pending: remaining };
}
