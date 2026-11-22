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
/**
 * Mesa de 2 tiles: deslocamentos a partir do canto esquerdo e da base da pegada inteira. Na mesa
 * larga (para cima/baixo) o monitor fica no meio e os itens nas pontas; na lateral, o monitor fica
 * na metade de cima e os itens embaixo e no alto.
 */
export const SLOT_OFFSET_WIDE: Record<Dir, Record<Slot | 'monitor', [x: number, y: number]>> = {
  down: { monitor: [8, -2], left: [-3, -3], right: [19, -3], back: [8, -14], floor: [30, 2] },
  up: { monitor: [8, -2], left: [19, -3], right: [-3, -3], back: [8, 14], floor: [-14, -2] },
  left: { monitor: [0, -17], left: [0, -3], right: [0, -27], back: [-14, -8], floor: [2, 14] },
  right: { monitor: [0, -17], left: [0, -27], right: [0, -3], back: [14, -8], floor: [-2, -30] },
};

export const SLOT_OFFSET: Record<Dir, Record<Slot, [x: number, y: number]>> = {
  down: { left: [5, -3], right: [-5, -3], back: [0, -14], floor: [14, 2] },
  up: { left: [-5, 3], right: [5, 3], back: [0, 14], floor: [-14, -2] },
  left: { left: [-3, 5], right: [-3, -5], back: [-14, 0], floor: [2, 14] },
  right: { left: [3, -5], right: [3, 5], back: [14, 0], floor: [-2, -14] },
};

export interface DividerLayout {
  /** Peças do desk-decor, deslocadas a partir do canto esquerdo e da base da pegada. */
  pieces: { item: string; dx: number; dy: number; flip: boolean }[];
  /** Onde o item "de parede" fica preso no painel. */
  back: [x: number, y: number];
  /** A divisória fica atrás da mesa (virada para baixo) ou na frente dela (para cima). */
  behind: boolean;
}

/**
 * Divisória de baia para mesa sem parede atrás: a decoração "de parede" fica presa nela em vez
 * de flutuar. Na mesa de frente (para cima/baixo) o painel corre ao longo da borda de trás; na
 * lateral, é um painel estreito do lado de trás, espelhado conforme o lado.
 */
export function dividerLayout(desk: CompiledDesk): DividerLayout | null {
  if (desk.wallBehind) return null;
  const T = 16;
  if (desk.orientation === 'down' || desk.orientation === 'up') {
    const down = desk.orientation === 'down';
    const dy = down ? -7 : 6;
    const pieces =
      desk.w === 2
        ? [
            { item: 'divider-wide-l', dx: 0, dy, flip: false },
            { item: 'divider-wide-r', dx: T, dy, flip: false },
          ]
        : [{ item: 'divider', dx: 0, dy, flip: false }];
    return { pieces, back: [desk.w === 2 ? 8 : 0, down ? -9 : 4], behind: down };
  }
  const left = desk.orientation === 'left';
  const dx = left ? desk.w * T - 12 : -4;
  const pieces = Array.from({ length: desk.h }, (_, i) => ({ item: 'divider-side', dx, dy: -(desk.h - 1 - i) * T, flip: !left }));
  return { pieces, back: [left ? desk.w * T - 8 : -8, desk.h === 2 ? -10 : -2], behind: true };
}
