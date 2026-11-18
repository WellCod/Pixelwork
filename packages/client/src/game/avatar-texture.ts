import {
  ACCESSORY_IDS,
  BODY_IDS,
  DIRS,
  HAIR_IDS,
  OUTFIT_IDS,
  avatarKey,
  characterImageUrl,
  type AvatarSpec,
  type CharacterLayer,
} from '@pixelwork/shared';
import type * as Phaser from 'phaser';
import { COLS, FRAME_H, FRAME_W, ROWS, composeAvatar, walkFrames } from './avatar-compose.ts';

const layerKey = (layer: CharacterLayer, id: string) => `char:${layer}:${id}`;

/** Carrega todas as camadas do catálogo; a composição acontece sob demanda. */
export function preloadCharacterLayers(scene: Phaser.Scene): void {
  const layers: [CharacterLayer, readonly string[]][] = [
    ['body', BODY_IDS],
    ['outfit', OUTFIT_IDS],
    ['hair', HAIR_IDS],
    ['accessory', ACCESSORY_IDS],
  ];
  for (const [layer, ids] of layers) {
    for (const id of ids) scene.load.image(layerKey(layer, id), characterImageUrl(layer, id));
  }
}

export const walkAnim = (textureKey: string, dir: string) => `${textureKey}:walk-${dir}`;

/** Textura com frames e animações; avatares iguais compartilham a mesma (cache pela chave do spec). */
export function ensureAvatarTexture(scene: Phaser.Scene, spec: AvatarSpec): string {
  const key = `avatar:${avatarKey(spec)}`;
  if (scene.textures.exists(key)) return key;

  const canvas = composeAvatar(
    spec,
    (layer, id) => scene.textures.get(layerKey(layer, id)).getSourceImage() as CanvasImageSource,
  );
  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`falha ao registrar a textura ${key}`);
  for (let frame = 0; frame < COLS * ROWS; frame++) {
    texture.add(frame, 0, (frame % COLS) * FRAME_W, Math.floor(frame / COLS) * FRAME_H, FRAME_W, FRAME_H);
  }
  for (const dir of DIRS) {
    scene.anims.create({
      key: walkAnim(key, dir),
      frames: walkFrames(dir).map((frame) => ({ key, frame })),
      frameRate: 10,
      repeat: -1,
    });
  }
  return key;
}
