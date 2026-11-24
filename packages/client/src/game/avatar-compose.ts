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
    ['backpack', spec.backpack ?? null],
    // A máscara do Grinch é uma cabeça inteira, incluindo o tufo de pelo.
    ['hair', spec.accessory === 'grinch-mask' ? null : spec.hair],
    ['accessory', spec.accessory],
    ['headwear', spec.headwear ?? null],
  ];
  return layers.filter((entry): entry is [CharacterLayer, string] => entry[1] !== null);
}

/** `#rrggbb` -> [r, g, b]. */
function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/**
 * Cor-chave (inteiro 0xRRGGBB) -> cor final da rampa escolhida. As camadas são desenhadas com
 * rampas-chave fixas; a posição na rampa-chave diz qual tom da rampa escolhida entra no lugar.
 */
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
  layerImage: (layer: CharacterLayer, id: string) => CanvasImageSource,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * COLS;
  canvas.height = FRAME_H * ROWS;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas 2d indisponível');

  for (const [layer, id] of layersOf(spec)) context.drawImage(layerImage(layer, id), 0, 0);

  // Varre os pixels em RGBA (4 bytes cada): pula os transparentes e troca as cores-chave.
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const table = swapTable(spec);
  const rgba = image.data;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const color = ((rgba[i] ?? 0) << 16) | ((rgba[i + 1] ?? 0) << 8) | (rgba[i + 2] ?? 0);
    const replacement = table.get(color);
    if (replacement) [rgba[i], rgba[i + 1], rgba[i + 2]] = replacement;
  }
  context.putImageData(image, 0, 0);
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

/** Os quatro frames da caminhada numa direção (a linha inteira). */
export function walkFrames(dir: FrameDir): number[] {
  return [0, 1, 2, 3].map((col) => DIR_ROW[dir] * COLS + col);
}
