import { TILE_PX, type CompiledDesk } from '@pixelwork/shared';
import type { Scene } from 'phaser';

interface DeskJoin {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
}

/** Conecta bordas vizinhas de mesmo tamanho, nas laterais ou costas com costas. */
export function deskJoins(desks: readonly CompiledDesk[]): DeskJoin[] {
  const at = new Map(desks.map((desk) => [`${desk.x},${desk.y}`, desk]));
  const joins: DeskJoin[] = [];
  for (const desk of desks) {
    const { x, y, width, height, orientation } = desk;
    const across = orientation === 'up' || orientation === 'down';
    const left = x * TILE_PX;
    const top = y * TILE_PX;
    const right = (x + width) * TILE_PX;
    const bottom = (y + height) * TILE_PX;
    const neighborRight = at.get(`${x + width},${y}`);
    const neighborBelow = at.get(`${x},${y + height}`);
    const sameSize = (neighbor: CompiledDesk | undefined) => neighbor?.width === width && neighbor.height === height;
    if (sameSize(neighborRight)) {
      if (across && neighborRight?.orientation === orientation) {
        joins.push({ x: right - 1, y: top + (orientation === 'up' ? 4 : 3), width: 2, height: 9, depth: bottom });
      } else if (orientation === 'left' && neighborRight?.orientation === 'right') {
        joins.push({ x: right - 3, y: top + 2, width: 6, height: height * TILE_PX - 6, depth: bottom });
      }
    }
    if (sameSize(neighborBelow)) {
      if (!across && neighborBelow?.orientation === orientation) {
        joins.push({ x: left + 1, y: bottom - 7, width: width * TILE_PX - 2, height: 10, depth: bottom });
      } else if (orientation === 'up' && neighborBelow?.orientation === 'down') {
        joins.push({ x: left + 1, y: bottom - 4, width: width * TILE_PX - 2, height: 8, depth: bottom });
      }
    }
  }
  return joins;
}

/** Une visualmente os tampos embaixo dos sprites e da decoração. */
export function drawDeskJoins(scene: Scene, desks: readonly CompiledDesk[], editorDepth?: number) {
  return deskJoins(desks).map((join) => {
    const { x, y, width, height, depth } = join;
    return scene.add.graphics().setDepth(editorDepth ?? depth - 0.25)
      .fillStyle(0xcd683d).fillRect(x, y, width, height)
      .fillStyle(0xe6cba5).fillRect(x, y + 1, width, height - 2);
  });
}
