import {
  ACCESSORY_IDS,
  BODY_IDS,
  DIRS,
  HAIR_IDS,
  KEY_RAMPS,
  OUTFIT_IDS,
  RAMPS,
  avatarKey,
  characterImageUrl,
  type AvatarSpec,
  type CharacterLayer,
} from '@pixelwork/shared';
import type * as Phaser from 'phaser';

const FRAME_W = 16;
const FRAME_H = 32;
const COLS = 4;
const ROWS = 5;

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

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mapa de cor-chave (inteiro 0xRRGGBB) para a cor final da rampa escolhida. */
function swapTable(spec: AvatarSpec): Map<number, [number, number, number]> {
  const table = new Map<number, [number, number, number]>();
  const pairs: [readonly string[], readonly string[]][] = [
    [KEY_RAMPS.skin, RAMPS.skin[spec.skin]],
    [KEY_RAMPS.hair, RAMPS.hair[spec.hairColor]],
    [KEY_RAMPS.outfit, RAMPS.outfit[spec.outfitColor]],
  ];
  for (const [keys, ramp] of pairs) {
    keys.forEach((key, i) => {
      const color = ramp[i];
      if (color) table.set(parseInt(key.slice(1), 16), rgb(color));
    });
  }
  return table;
}

export const walkAnim = (textureKey: string, dir: string) => `${textureKey}:walk-${dir}`;

/**
 * Compõe as camadas, troca as cores-chave e registra a textura com frames e animações.
 * O cache é pela chave do AvatarSpec: avatares iguais compartilham a textura.
 */
export function ensureAvatarTexture(scene: Phaser.Scene, spec: AvatarSpec): string {
  const key = `avatar:${avatarKey(spec)}`;
  if (scene.textures.exists(key)) return key;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS;
  canvas.height = FRAME_H * ROWS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponível');

  const layers: [CharacterLayer, string | null][] = [
    ['body', spec.body],
    ['outfit', spec.outfit],
    ['hair', spec.hair],
    ['accessory', spec.accessory],
  ];
  for (const [layer, id] of layers) {
    if (!id) continue;
    const source = scene.textures.get(layerKey(layer, id)).getSourceImage();
    ctx.drawImage(source as CanvasImageSource, 0, 0);
  }

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const table = swapTable(spec);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const color = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0);
    const swap = table.get(color);
    if (swap) [data[i], data[i + 1], data[i + 2]] = swap;
  }
  ctx.putImageData(image, 0, 0);

  const texture = scene.textures.addCanvas(key, canvas);
  if (!texture) throw new Error(`falha ao registrar a textura ${key}`);
  for (let frame = 0; frame < COLS * ROWS; frame++) {
    texture.add(frame, 0, (frame % COLS) * FRAME_W, Math.floor(frame / COLS) * FRAME_H, FRAME_W, FRAME_H);
  }
  DIRS.forEach((dir) => {
    const row = { down: 0, left: 1, right: 2, up: 3 }[dir];
    scene.anims.create({
      key: walkAnim(key, dir),
      frames: [0, 1, 2, 3].map((col) => ({ key, frame: row * COLS + col })),
      frameRate: 10,
      repeat: -1,
    });
  });
  return key;
}

/** Frame parado de cada direção (coluna 0 da linha). */
export function idleFrame(dir: string): number {
  return ({ down: 0, left: 1, right: 2, up: 3 }[dir] ?? 0) * COLS;
}
