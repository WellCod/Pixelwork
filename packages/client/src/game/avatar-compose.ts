import { KEY_RAMPS, RAMPS, type AvatarSpec, type CharacterLayer } from '@pixelwork/shared';

export const FRAME_W = 16;
export const FRAME_H = 32;
export const COLS = 4;
export const ROWS = 5;

/** Ordem de composição das camadas (docs/art.md, seção 4). */
export function layersOf(spec: AvatarSpec): [CharacterLayer, string][] {
  const layers: [CharacterLayer, string | null][] = [
    ['body', spec.body],
    ['outfit', spec.outfit],
    ['hair', spec.hair],
    ['accessory', spec.accessory],
  ];
  return layers.filter((l): l is [CharacterLayer, string] => l[1] !== null);
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** Cor-chave (inteiro 0xRRGGBB) -> cor final da rampa escolhida. */
export function swapTable(spec: AvatarSpec): Map<number, [number, number, number]> {
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

/**
 * Compõe as camadas na folha 64x160 e troca as cores-chave. Usado pelo Phaser (textura) e
 * pela prévia do editor de avatar, para os dois mostrarem exatamente o mesmo resultado.
 */
export function composeAvatar(
  spec: AvatarSpec,
  layer: (layer: CharacterLayer, id: string) => CanvasImageSource,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS;
  canvas.height = FRAME_H * ROWS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponível');

  for (const [name, id] of layersOf(spec)) ctx.drawImage(layer(name, id), 0, 0);

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
  return canvas;
}

const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 } as const;
type FrameDir = keyof typeof DIR_ROW;

/** Frame parado de cada direção (coluna 0 da linha). */
export function idleFrame(dir: FrameDir): number {
  return DIR_ROW[dir] * COLS;
}

/** Linha 4: sentado, uma coluna por direção (baixo, esquerda, direita, cima). */
export function seatedFrame(dir: FrameDir): number {
  return 4 * COLS + DIR_ROW[dir];
}

export function walkFrames(dir: FrameDir): number[] {
  return [0, 1, 2, 3].map((col) => DIR_ROW[dir] * COLS + col);
}
