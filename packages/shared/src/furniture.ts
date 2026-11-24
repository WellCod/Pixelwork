import { TILE_PX } from './constants.ts';

export const CONTACT_SHADOW_COLOR = 0x2e222f;

export interface ContactShadow {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  alpha: number;
}

const ellipse = (centerX: number, centerY: number, width: number, height: number, alpha: number): ContactShadow =>
  ({ centerX, centerY, width, height, alpha });

/** Identifica o sofá cujo braço ocupa só a célula direita da fileira da frente. */
export function isCornerSofa(item: string | undefined, width: number, height: number): boolean {
  return item === 'sofa-l' && width === 3 * TILE_PX && height === 2 * TILE_PX;
}

/** Sombras da mesa a partir do canto esquerdo e da base, em pixels de mundo. */
export function deskContactShadows(width: number, height: number): readonly ContactShadow[] {
  if (height > TILE_PX) {
    return [ellipse(8.5, -11, 9, 20, 0.10), ellipse(8.5, -1, 13, 5, 0.18)];
  }
  return [
    ellipse(width / 2, -3.5, width - 4, 5, 0.10),
    ellipse(3.5, -1, 6, 4, 0.18),
    ellipse(width - (width > TILE_PX ? 6 : 2.5), -1, width > TILE_PX ? 11 : 5, 4, 0.18),
  ];
}

/** Sombras do móvel a partir da âncora inferior esquerda do sprite. */
export function furnitureContactShadows(item: string | undefined, width: number, height: number): readonly ContactShadow[] {
  if (isCornerSofa(item, width, height)) {
    // A faixa horizontal pousa uma célula acima do fim do braço. O vão entre elas fica livre.
    return [ellipse(23, -17, 42, 5, 0.15), ellipse(42, -1, 11, 5, 0.17)];
  }
  if (item === 'desk' || item === 'basic' || item === 'dark' || item === 'white' || item === 'coffee-table') {
    return deskContactShadows(width, height);
  }
  if (item === 'meeting-table-long' || item === 'meeting-table-round') {
    return [ellipse(width / 2 + 0.5, -3, width - 8, 5, 0.14)];
  }
  return [ellipse(width / 2 + 0.5, -1.5, width - 3, 5, 0.14)];
}
