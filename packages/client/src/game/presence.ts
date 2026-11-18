import {
  PROXIMITY_ENTER_TILES,
  type CompiledDesk,
  type CompiledMap,
  type DeskState,
  type Dir,
} from '@pixelwork/shared';

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function deskAtChair(map: CompiledMap, x: number, y: number): CompiledDesk | undefined {
  return map.desks.find((d) => d.chairX === x && d.chairY === y);
}

/**
 * Sentado = na cadeira da própria mesa. Devolve para onde a pessoa olha (para a mesa),
 * ou null se não estiver sentada.
 */
export function seatedFacing(
  map: CompiledMap,
  desks: ReadonlyMap<string, DeskState>,
  userId: string,
  x: number,
  y: number,
): Dir | null {
  const desk = deskAtChair(map, x, y);
  if (!desk || desks.get(desk.key)?.userId !== userId) return null;
  return OPPOSITE[desk.orientation];
}

/** Distância euclidiana entre centros de tile, no raio de entrada da proximidade. */
export function isNear(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= PROXIMITY_ENTER_TILES;
}

export type Slot = 'left' | 'right' | 'back' | 'floor';

/**
 * Deslocamento em pixels de cada slot a partir do tile da mesa. Esquerda e direita são as de
 * quem está sentado; o fundo fica atrás da mesa e o chão ao lado dela.
 */
export const SLOT_OFFSET: Record<Dir, Record<Slot, [x: number, y: number]>> = {
  down: { left: [5, -3], right: [-5, -3], back: [0, -14], floor: [14, 2] },
  up: { left: [-5, 3], right: [5, 3], back: [0, 14], floor: [-14, -2] },
  left: { left: [-3, 5], right: [-3, -5], back: [-14, 0], floor: [2, 14] },
  right: { left: [3, -5], right: [3, 5], back: [14, 0], floor: [-2, -14] },
};
