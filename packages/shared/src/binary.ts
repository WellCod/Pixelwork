import type { Dir } from './protocol.ts';

/**
 * Tick binário (aprovado em 2026-11). O JSON mandava um UUID de 36 caracteres por movimento;
 * aqui cada movimento ocupa 5 bytes, com o id curto que o servidor dá a cada jogador no
 * `welcome` e no `player.join`.
 *
 *   u8  tipo (1 = tick)
 *   u32 ack
 *   f64 ts   hora do servidor (ms)
 *   u16 n    quantidade de movimentos
 *   n x { u16 id curto, u8 x, u8 y, u8 dir }
 *
 * Little-endian. x e y cabem em u8 porque o mapa tem no máximo 100x100 tiles.
 */
export const BINARY_TICK = 1;
export const TICK_HEADER_BYTES = 1 + 4 + 8 + 2;
export const TICK_MOVE_BYTES = 5;
/** Posição do `ack` no quadro: o servidor monta os movimentos uma vez e troca só o ack. */
export const TICK_ACK_OFFSET = 1;
/** Posição do `ts` (f64), logo depois do tipo e do ack. */
const TICK_TS_OFFSET = 5;
/** Posição da quantidade de movimentos (u16), logo depois do ts. */
const TICK_COUNT_OFFSET = 13;

/** Direção no fio: o índice nesta lista vira o byte `dir` do movimento. */
const DIR_CODES: readonly Dir[] = ['up', 'down', 'left', 'right'];

/** Movimento do tick com o id curto (u16) do jogador no lugar do UUID. */
export type ShortMove = [shortId: number, x: number, y: number, dir: Dir];

/** Monta o quadro binário do tick no formato descrito acima. */
export function encodeTick(ack: number, ts: number, moves: readonly ShortMove[]): Uint8Array {
  const bytes = new Uint8Array(TICK_HEADER_BYTES + moves.length * TICK_MOVE_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, BINARY_TICK);
  view.setUint32(TICK_ACK_OFFSET, ack, true);
  view.setFloat64(TICK_TS_OFFSET, ts, true);
  view.setUint16(TICK_COUNT_OFFSET, moves.length, true);
  let offset = TICK_HEADER_BYTES;
  for (const [shortId, x, y, dir] of moves) {
    view.setUint16(offset, shortId, true);
    view.setUint8(offset + 2, x);
    view.setUint8(offset + 3, y);
    const dirCode = DIR_CODES.indexOf(dir);
    // O tipo impede, mas dado ruim em tempo de execução viraria o byte 255 e o tick inteiro seria
    // recusado no cliente; melhor falhar aqui, onde o erro aponta para quem mandou.
    if (dirCode < 0) throw new Error(`direção inválida no tick: ${dir}`);
    view.setUint8(offset + 4, dirCode);
    offset += TICK_MOVE_BYTES;
  }
  return bytes;
}

/** Troca o ack de um quadro já montado (cópia por destinatário). */
export function withAck(frame: Uint8Array, ack: number): Uint8Array {
  const copy = frame.slice();
  new DataView(copy.buffer).setUint32(TICK_ACK_OFFSET, ack, true);
  return copy;
}

/**
 * Lê o quadro binário do tick. Devolve null para quadro de outro tipo, com tamanho que não bate
 * com a quantidade declarada de movimentos ou com código de direção desconhecido.
 */
export function decodeTick(data: ArrayBuffer | Uint8Array): { ack: number; ts: number; moves: ShortMove[] } | null {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < TICK_HEADER_BYTES) return null;
  // O Uint8Array pode ser uma fatia de um buffer maior: a view respeita o offset dele.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== BINARY_TICK) return null;
  const count = view.getUint16(TICK_COUNT_OFFSET, true);
  if (bytes.length !== TICK_HEADER_BYTES + count * TICK_MOVE_BYTES) return null;
  const moves: ShortMove[] = [];
  let offset = TICK_HEADER_BYTES;
  for (let i = 0; i < count; i++) {
    const dir = DIR_CODES[view.getUint8(offset + 4)];
    if (!dir) return null;
    moves.push([view.getUint16(offset, true), view.getUint8(offset + 2), view.getUint8(offset + 3), dir]);
    offset += TICK_MOVE_BYTES;
  }
  return { ack: view.getUint32(TICK_ACK_OFFSET, true), ts: view.getFloat64(TICK_TS_OFFSET, true), moves };
}
