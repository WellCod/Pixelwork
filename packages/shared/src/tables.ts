// Móveis com interação (docs/architecture.md, "Interações com objetos"): reconhecidos pelo
// item_id do catálogo, sem nada novo no mapa salvo.
import type { CompiledMap } from './map.ts';
import type { PongSide } from './pong.ts';

export type GameKind = 'pong';

/** item_id do catálogo -> jogo da mesa. */
export const INTERACTIVE_ITEMS: Readonly<Record<string, GameKind>> = { 'ping-pong': 'pong' };

export interface CompiledTable {
  /** `<item>@<x>,<y>`, com o canto superior esquerdo da pegada em tiles. */
  key: string;
  game: GameKind;
  /** Pegada em tiles; (x, y) é o canto superior esquerdo. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tiles caminháveis logo à esquerda e logo à direita da pegada, onde os jogadores ficam. */
  sides: { left: [x: number, y: number][]; right: [x: number, y: number][] };
}

/** Mesa e lado de quem está no tile (x, y), ou null fora dos lados de qualquer mesa. */
export function tableAtSide(map: CompiledMap, x: number, y: number): { table: CompiledTable; side: PongSide } | null {
  for (const table of map.tables) {
    for (const side of ['left', 'right'] as const) {
      if (table.sides[side].some(([sx, sy]) => sx === x && sy === y)) return { table, side };
    }
  }
  return null;
}
