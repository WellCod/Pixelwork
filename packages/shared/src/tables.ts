// Móveis com interação (docs/architecture.md, "Interações com objetos"): reconhecidos pelo
// item_id do catálogo, sem nada novo no mapa salvo.
import type { TilesetId } from './catalog.generated.ts';
import type { CompiledMap } from './map.ts';
import type { PongSide } from './pong.ts';

/** Jogos disponíveis nas mesas interativas. */
export type GameKind = 'pong' | 'foosball';

type SideAxis = 'x' | 'y';
type TableItem = 'ping-pong' | 'foosball';
interface GameTableLayout {
  item: TableItem;
  game: GameKind;
  sideAxis: SideAxis;
  alternateTileset: Extract<TilesetId, 'furniture-3x2' | 'furniture-2x3'>;
  alternateItem: string;
}

const GAME_TABLES = new Map<string, GameTableLayout>([
  ['ping-pong', { item: 'ping-pong', game: 'pong', sideAxis: 'x', alternateTileset: 'furniture-2x3', alternateItem: 'ping-pong-vertical' }],
  ['ping-pong-vertical', { item: 'ping-pong', game: 'pong', sideAxis: 'y', alternateTileset: 'furniture-3x2', alternateItem: 'ping-pong' }],
  ['foosball', { item: 'foosball', game: 'foosball', sideAxis: 'y', alternateTileset: 'furniture-2x3', alternateItem: 'foosball-vertical' }],
  ['foosball-vertical', { item: 'foosball', game: 'foosball', sideAxis: 'x', alternateTileset: 'furniture-3x2', alternateItem: 'foosball' }],
]);

/** Orientação dos pontos de jogo e sprite da próxima rotação. */
export function gameTableLayout(item: string | undefined): GameTableLayout | undefined {
  return item === undefined ? undefined : GAME_TABLES.get(item);
}

export interface CompiledTable {
  /** `<item>@<x>,<y>`, com o canto superior esquerdo da pegada em tiles. */
  key: string;
  game: GameKind;
  /** Pegada em tiles; (x, y) é o canto superior esquerdo. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Lados lógicos do jogo, em colunas ou fileiras conforme as hastes ou as raquetes. */
  sides: { left: [x: number, y: number][]; right: [x: number, y: number][] };
}

/** Calcula os pontos nos lados opostos da mesa e descarta tiles bloqueados ou fora do mapa. */
export function gameTableSides(
  table: Pick<CompiledTable, 'x' | 'y' | 'width' | 'height'>,
  axis: SideAxis,
  mapWidth: number,
  mapHeight: number,
  canStand: (x: number, y: number) => boolean,
): CompiledTable['sides'] {
  if (axis === 'x') {
    const column = (x: number) => {
      const spots: [number, number][] = [];
      for (let y = Math.max(0, table.y); y < Math.min(mapHeight, table.y + table.height); y++) {
        if (canStand(x, y)) spots.push([x, y]);
      }
      return spots;
    };
    return { left: column(table.x - 1), right: column(table.x + table.width) };
  }
  const row = (y: number) => {
    const spots: [number, number][] = [];
    for (let x = Math.max(0, table.x); x < Math.min(mapWidth, table.x + table.width); x++) {
      if (canStand(x, y)) spots.push([x, y]);
    }
    return spots;
  };
  return { left: row(table.y - 1), right: row(table.y + table.height) };
}

/** Mesa e lado de quem está no tile (x, y), ou null fora dos lados de qualquer mesa. */
export function tableAtSide(map: CompiledMap, x: number, y: number): { table: CompiledTable; side: PongSide } | null {
  for (const table of map.tables) {
    for (const side of ['left', 'right'] as const) {
      if (table.sides[side].some(([sideX, sideY]) => sideX === x && sideY === y)) return { table, side };
    }
  }
  return null;
}
