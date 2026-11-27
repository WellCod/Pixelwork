import { TILE_PX, type AvatarSpec } from '@pixelwork/shared';
import type * as Phaser from 'phaser';
import { idleFrame, seatedFrame } from './avatar-compose.ts';
import { ensureAvatarTexture } from './avatar-texture.ts';

const RECEPTION_AVATAR: AvatarSpec = {
  body: 'base', skin: 'medium', hair: 'bun', hairColor: 'black', outfit: 'cardigan', outfitColor: 'green', accessory: 'glasses',
};

/** Banco para uma pose sentada sem cadeira desenhada no móvel. */
export function drawStool(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.add.graphics()
    .fillStyle(0x374e4a).fillRect(-6, -5, 2, 5).fillRect(4, -5, 2, 5)
    .fillStyle(0x966c6c).fillRoundedRect(-7, -8, 14, 4, 1)
    .fillStyle(0xe6cba5).fillRect(-6, -8, 12, 2);
}

/** Desenha a recepção na mesma pose no editor e no escritório. */
export function drawReceptionAvatar(scene: Phaser.Scene, tileX: number, tileY: number, seated: boolean, depth?: number) {
  const x = (tileX + 0.5) * TILE_PX;
  // Aproxima o banco do tampo, mantendo o tile de interação atrás do balcão.
  const y = (tileY + 1) * TILE_PX + (seated ? 12 : 0);
  const spriteDepth = depth ?? y;
  const sprite = scene.add.sprite(x, y, ensureAvatarTexture(scene, RECEPTION_AVATAR),
    seated ? seatedFrame('down') : idleFrame('down')).setOrigin(0.5, 1).setDepth(spriteDepth);
  const stool = seated ? drawStool(scene).setPosition(x, y).setDepth(spriteDepth - 0.3) : undefined;
  return { x, y, sprite, stool };
}
