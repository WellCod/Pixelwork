import { describe, expect, it } from 'vitest';
import { TICK_HEADER_BYTES, decodeTick, encodeTick, withAck } from './binary.ts';

describe('tick binário', () => {
  it('ida e volta preserva ack, ts e movimentos', () => {
    const frame = encodeTick(42, 1_795_372_653_945.5, [
      [1, 10, 20, 'up'],
      [65_535, 99, 0, 'right'],
    ]);
    expect(frame.length).toBe(TICK_HEADER_BYTES + 10);
    expect(decodeTick(frame)).toEqual({
      ack: 42,
      ts: 1_795_372_653_945.5,
      moves: [
        [1, 10, 20, 'up'],
        [65_535, 99, 0, 'right'],
      ],
    });
  });

  it('direção fora da lista falha na codificação, sem gerar byte 255', () => {
    const badMove = [1, 2, 3, 'diagonal'] as unknown as Parameters<typeof encodeTick>[2][number];
    expect(() => encodeTick(1, 0, [badMove])).toThrow(/direção inválida/);
  });

  it('withAck troca só o ack, numa cópia', () => {
    const frame = encodeTick(0, 5, [[3, 1, 2, 'down']]);
    const mine = withAck(frame, 7);
    expect(decodeTick(mine)?.ack).toBe(7);
    expect(decodeTick(frame)?.ack).toBe(0);
    expect(decodeTick(mine)?.moves).toEqual([[3, 1, 2, 'down']]);
  });

  it('quadro truncado ou de outro tipo é recusado', () => {
    const frame = encodeTick(1, 1, [[1, 1, 1, 'left']]);
    expect(decodeTick(frame.slice(0, frame.length - 1))).toBeNull();
    const other = frame.slice();
    other[0] = 9;
    expect(decodeTick(other)).toBeNull();
  });

  it('é bem menor que o JSON com UUID', () => {
    const moves = Array.from({ length: 50 }, (_, i) => [i, i, i, 'down'] as [number, number, number, 'down']);
    const binary = encodeTick(1, 1, moves).length;
    const json = JSON.stringify({
      t: 'tick',
      ack: 1,
      moves: moves.map(([, x, y, dir]) => ['01a2047c-984a-7d77-ae26-657a0b259a2d', x, y, dir]),
      ts: 1,
    }).length;
    expect(binary * 8).toBeLessThan(json);
  });
});
