import { TILE_PX } from './constants.ts';
import type { Dir } from './protocol.ts';

export type FurnitureSeatKind = 'sofa' | 'table' | 'stool';

export interface FurnitureSeat {
  key: string;
  kind: FurnitureSeatKind;
  /** Posição do pé do avatar e ordem de desenho, em pixels do mapa. */
  x: number;
  y: number;
  depth: number;
  facing: Dir;
  /** Tiles de chão de onde se pode sentar nesta vaga. */
  approaches: readonly (readonly [x: number, y: number])[];
}

const SOFAS = new Set(['sofa', 'sofa-peach', 'sofa-sage', 'sofa-blue', 'halloween-vampire-sofa']);

/** As posições acompanham as almofadas e cadeiras desenhadas nos sprites. */
export function furnitureSeatLayout(
  item: string | undefined, left: number, top: number, width: number, height: number,
): FurnitureSeat[] {
  if (!item) return [];
  const make = (
    index: number, kind: FurnitureSeatKind, x: number, y: number, facing: Dir,
    approachOffsets: FurnitureSeat['approaches'], depth = y,
  ): FurnitureSeat => ({
    key: `${item}@${left},${top}:${index}`, kind,
    x: left * TILE_PX + x, y: top * TILE_PX + y, depth: top * TILE_PX + depth, facing,
    approaches: approachOffsets.map(([dx, dy]) => [left + dx, top + dy]),
  });

  if (item === 'sofa-l' && width === 3 && height === 2) {
    return [
      make(0, 'sofa', 10, 15, 'down', [[0, 1]], 16.1),
      make(1, 'sofa', 23, 15, 'down', [[1, 1]], 16.1),
      make(2, 'sofa', 41, 27, 'down', [[2, 2], [3, 1]], 32.1),
    ];
  }
  if (SOFAS.has(item) && height === 1 && (width === 1 || width === 2)) {
    return Array.from({ length: width }, (_, index) =>
      make(index, 'sofa', index * TILE_PX + TILE_PX / 2, 15, 'down', [[index, 1]], 16.1),
    );
  }
  if (item === 'meeting-table-round' && width === 2 && height === 2) {
    return [
      make(0, 'table', 16, 11, 'down', [[0, -1], [1, -1]]),
      make(1, 'table', 16, 32, 'up', [[0, 2], [1, 2]], 32.1),
      make(2, 'table', 4, 22, 'right', [[-1, 0], [-1, 1]]),
      make(3, 'table', 28, 22, 'left', [[2, 0], [2, 1]]),
    ];
  }
  if (item === 'bar-stool' && width === 1 && height === 1) {
    return [make(0, 'stool', 8, 12, 'up', [[0, 0]], 16.1)];
  }
  return [];
}

/** Sentar não muda a posição lógica do avatar. */
export function canReachFurnitureSeat(seat: FurnitureSeat, x: number, y: number): boolean {
  return seat.approaches.some(([tileX, tileY]) => tileX === x && tileY === y);
}
