import {
  PROXIMITY_ENTER_TILES,
  TILE_PX,
  TILESETS,
  TILESET_IDS,
  type TilesetId,
  type CompiledDesk,
  type CompiledMap,
  type DeskDecor,
  type DeskState,
  type Dir,
} from '@pixelwork/shared';

const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Mesa cuja cadeira fica nesse tile, se houver. */
export function deskAtChair(map: CompiledMap, x: number, y: number): CompiledDesk | undefined {
  return map.desks.find((desk) => desk.chairX === x && desk.chairY === y);
}

/** Pose na cadeira da própria mesa, com deslocamento em pixels até o meio da borda. */
export function seatedPose(
  map: CompiledMap,
  desks: ReadonlyMap<string, DeskState>,
  userId: string,
  x: number,
  y: number,
): { facing: Dir; dx: number; dy: number } | null {
  const desk = deskAtChair(map, x, y);
  if (!desk || desks.get(desk.key)?.userId !== userId) return null;
  return {
    facing: OPPOSITE[desk.orientation],
    dx: ((desk.width - 1) * TILE_PX) / 2,
    dy: ((desk.height - 1) * TILE_PX) / 2,
  };
}

/** Distância euclidiana entre centros de tile, no raio de entrada da proximidade. */
export function isNear(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.hypot(ax - bx, ay - by) <= PROXIMITY_ENTER_TILES;
}

export type Slot = 'left' | 'right' | 'back' | 'floor';

/**
 * Mesa de 2 tiles: deslocamentos a partir do canto esquerdo e da base da pegada inteira. Na mesa
 * larga (para cima/baixo) o monitor fica no meio e os itens nas pontas; na lateral, o monitor fica
 * na metade de cima e os itens embaixo e no alto.
 */
export const SLOT_OFFSET_WIDE: Record<Dir, Record<Slot | 'monitor', [x: number, y: number]>> = {
  down: { monitor: [8, -2], left: [-3, -3], right: [19, -3], back: [8, -14], floor: [30, 2] },
  up: { monitor: [8, -1], left: [19, -3], right: [-3, -3], back: [8, 14], floor: [-14, -2] },
  left: { monitor: [2, -17], left: [0, -3], right: [0, -27], back: [-14, -8], floor: [2, 14] },
  right: { monitor: [-2, -17], left: [0, -27], right: [0, -3], back: [14, -8], floor: [-2, -30] },
};

/**
 * Mesa de 1 tile: deslocamento em pixels de cada slot a partir do tile da mesa. Esquerda e direita
 * são as de quem está sentado; o fundo fica atrás da mesa e o chão ao lado dela.
 */
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
  const TILE = 16;
  if (desk.orientation === 'down' || desk.orientation === 'up') {
    const down = desk.orientation === 'down';
    const dy = down ? -7 : 6;
    const pieces =
      desk.width === 2
        ? [
            { item: 'divider-wide-l', dx: 0, dy, flip: false },
            { item: 'divider-wide-r', dx: TILE, dy, flip: false },
          ]
        : [{ item: 'divider', dx: 0, dy, flip: false }];
    return { pieces, back: [desk.width === 2 ? 8 : 0, down ? -9 : 4], behind: down };
  }
  // Lateral: um painel por tile de altura, empilhados de baixo para cima a partir da base.
  const left = desk.orientation === 'left';
  const dx = left ? desk.width * TILE - 12 : -4;
  const pieces = Array.from({ length: desk.height }, (_, i) => ({ item: 'divider-side', dx, dy: -(desk.height - 1 - i) * TILE, flip: !left }));
  return { pieces, back: [left ? desk.width * TILE - 8 : -8, desk.height === 2 ? -10 : -2], behind: true };
}

export interface DeskSprite {
  /** ID do item no catálogo de decoração. */
  item: string;
  /** Deslocamento do canto inferior esquerdo do sprite a partir do canto esquerdo e da base da pegada. */
  dx: number;
  dy: number;
  /** Ordem de desenho relativa à base da mesa (somada à profundidade da base no jogo). */
  z: number;
  flip: boolean;
  flipY: boolean;
}

const SLOTS: Slot[] = ['back', 'left', 'right', 'floor'];

/**
 * Tudo o que compõe a mesa (tampo, monitor, divisória e decoração), na posição e ordem em que é
 * desenhado. Usado pelo jogo e pela prévia do editor de decoração, então os dois mostram o mesmo.
 * Mesa livre (sem decoração) aparece com a variação padrão e um monitor.
 */
export function deskSprites(desk: CompiledDesk, decor: DeskDecor | null): DeskSprite[] {
  const TILE = 16;
  const sprites: DeskSprite[] = [];
  const add = (item: string | null, dx: number, dy: number, z: number, flip = false, flipY = false) => {
    if (item) sprites.push({ item, dx, dy, z, flip, flipY });
  };
  const variant = decor?.variant ?? 'basic';
  const wide = desk.width === 2;
  const tall = desk.height === 2;
  const up = desk.orientation === 'up';
  const right = desk.orientation === 'right';
  // Na fileira oposta, o tampo gira 180° e o gaveteiro muda de lado.
  if (wide) {
    add(`${variant}-wide-l`, up ? TILE : 0, 0, 0, up, up);
    add(`${variant}-wide-r`, up ? 0 : TILE, 0, 0, up, up);
  } else if (tall) {
    add(`${variant}-tall-t`, 0, -TILE, 0, right);
    add(`${variant}-tall-b`, 0, 0, 0, right);
  } else {
    add(variant, 0, 0, 0, up || right, up);
  }
  const offsets = wide || tall ? SLOT_OFFSET_WIDE[desk.orientation] : { ...SLOT_OFFSET[desk.orientation], monitor: [0, up ? -1 : -2] as const };
  const angle = up ? '-back' : desk.orientation === 'left' || right ? '-side' : '';
  const monitor = `monitor-${decor?.monitor ?? 'single'}${angle}`;
  add(monitor, offsets.monitor[0], offsets.monitor[1], 0.1, right);
  if (!decor) return sprites;
  // Sem parede atrás, a decoração "de parede" vai presa numa divisória em vez de flutuar.
  const divider = decor.slots.back ? dividerLayout(desk) : null;
  if (divider) for (const piece of divider.pieces) add(piece.item, piece.dx, piece.dy, divider.behind ? -0.2 : 0.3, piece.flip);
  // Ordem em z: divisória atrás (-0,2) < item de parede nela (-0,15) < tampo (0) < monitor (0,1) <
  // itens do tampo e do chão (0,2); com a divisória na frente, ela e o item preso sobem acima de tudo.
  for (const slot of SLOTS) {
    const [dx, dy] = slot === 'back' && divider ? divider.back : offsets[slot];
    const backZ = divider ? (divider.behind ? -0.15 : 0.35) : -0.1;
    add(decor.slots[slot], dx, dy, slot === 'back' ? backZ : 0.2);
  }
  return sprites;
}

const DESK_DECOR_TILESETS = TILESET_IDS.filter((id) => id === 'desk-decor' || id.startsWith('desk-decor-'));
const DESK_DECOR_FRAMES = new Map(DESK_DECOR_TILESETS.flatMap((tileset) =>
  Object.entries(TILESETS[tileset].items).map(([frame, item]) => [item, { tileset, frame: Number(frame) }] as const),
));

/** Localiza o sprite de mesa ou decoração pelo mesmo ID na prévia e no mapa. */
export function deskDecorFrame(item: string): { tileset: TilesetId; frame: number } | undefined {
  return DESK_DECOR_FRAMES.get(item);
}
