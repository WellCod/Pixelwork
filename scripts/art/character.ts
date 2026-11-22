// Personagem em camadas (docs/art.md, seção 4): frame 16x32, 4 colunas x 5 linhas.
// Todas as camadas são derivadas da mesma silhueta do corpo, então encaixam pixel a pixel.
// Cores do corpo e do cabelo usam as rampas-chave (troca de paleta no cliente).
import { blank, grid, mirror, stamp, type Pixels } from '../lib/pixels.ts';

const FRAME_W = 16;
const FRAME_H = 32;
const PART_W = 12;
const X0 = 2;
const HEAD_Y = 8;
const TORSO_Y = 18;
const LEGS_Y = 25;

type Facing = 'down' | 'up' | 'left';
type Dir = Facing | 'right';
const part = (label: string, rows: string[]) => grid(rows, PART_W, label);

const HEAD: Record<Facing, Pixels> = {
  down: part('cabeça de frente', [
    '..KKKKKKKK..',
    '.K33333333K.',
    'K3333333333K',
    'K3433333343K',
    'K33K3333K33K',
    'K33K3333K33K',
    'K3333333333K',
    'K2333223332K',
    '.K22333322K.',
    '..KKKKKKKK..',
  ]),
  up: part('cabeça de costas', [
    '..KKKKKKKK..',
    '.K33333333K.',
    'K3333333333K',
    'K3333333333K',
    'K3333333333K',
    'K3333333333K',
    'K3333333333K',
    'K2333333332K',
    '.K22333322K.',
    '..KKKKKKKK..',
  ]),
  left: part('cabeça de lado', [
    '..KKKKKKKK..',
    '.K33333333K.',
    'K3333333333K',
    'K3433333333K',
    'K3K33333333K',
    'K3K33333333K',
    'K3333333333K',
    'K2233333332K',
    '.K22333322K.',
    '..KKKKKKKK..',
  ]),
};

const TORSO: Record<'front' | 'side', Pixels> = {
  front: part('tronco de frente', [
    '..KKKKKKKK..',
    '.K33333333K.',
    'K3K333333K3K',
    'K3K333333K3K',
    'K3K333333K3K',
    'K4K333333K4K',
    '.KKKKKKKKKK.',
  ]),
  side: part('tronco de lado', [
    '...KKKKKK...',
    '..K333333K..',
    '..K33K333K..',
    '..K33K333K..',
    '..K33K333K..',
    '..K34K333K..',
    '...KKKKKK...',
  ]),
};

/** Uma perna de 4 colunas; `lift` sobe o pé um pixel (passo da caminhada). */
function leg(target: Pixels, col: number, lift: number, skin = '3'): void {
  const skinRows = 4 - lift;
  for (let r = 0; r < skinRows; r++) stamp(target, [['K', skin, skin, 'K']], col, r);
  stamp(target, [['K', 'k', 'k', 'K']], col, skinRows);
  stamp(target, [['K', 'K', 'K', 'K']], col, skinRows + 1);
}

/** Pernas por fase da caminhada: 0 e 2 parado, 1 e 3 um pé de cada vez. */
function legs(facing: Facing, phase: number): Pixels {
  const p = blank(PART_W, 6);
  if (facing === 'left') {
    // De lado as pernas se cruzam: a de trás é mais escura e fica por baixo.
    if (phase === 1 || phase === 3) {
      leg(p, phase === 1 ? 6 : 2, 1, '2');
      leg(p, phase === 1 ? 2 : 6, 0);
    } else {
      leg(p, 4, 0);
    }
    return p;
  }
  leg(p, 2, phase === 1 ? 1 : 0);
  leg(p, 6, phase === 3 ? 1 : 0);
  return p;
}

/** Sentado: pernas dobradas, escondidas pela cadeira quando de costas. */
function seatedLegs(facing: Facing): Pixels {
  if (facing === 'up') return part('sentado de costas', ['..KKKKKKKK..', '............']);
  if (facing === 'left') {
    return part('sentado de lado', ['KK33333K....', 'Kkk3K33K....', 'KKKKKKKK....']);
  }
  return part('sentado de frente', ['..K33KK33K..', '..KkkKKkkK..', '..KKKKKKKK..']);
}

interface Pose {
  facing: Facing;
  phase: number;
  seated: boolean;
}

/** Corpo: cabeça, tronco e pernas, com a pele nas cores-chave. */
function body({ facing, phase, seated }: Pose): Pixels {
  const frame = blank(FRAME_W, FRAME_H);
  const dy = seated ? 2 : 0;
  stamp(frame, seated ? seatedLegs(facing) : legs(facing, phase), X0, LEGS_Y + dy);
  stamp(frame, TORSO[facing === 'left' ? 'side' : 'front'], X0, TORSO_Y + dy);
  stamp(frame, HEAD[facing], X0, HEAD_Y + dy);
  return frame;
}

/** Aplica `fn` em cada pixel da silhueta de uma parte; o que voltar não-nulo vira a camada. */
function overPart(
  frame: Pixels,
  source: Pixels,
  x0: number,
  y0: number,
  fn: (ch: string, x: number, y: number) => string | null,
): void {
  source.forEach((row, y) =>
    row.forEach((ch, x) => {
      if (ch === '.') return;
      const out = fn(ch, x, y);
      if (out !== null) stamp(frame, [[out]], x0 + x, y0 + y);
    }),
  );
}

// ---- roupa ----

type OutfitStyle = 'basic' | 'hoodie';

function outfit(style: OutfitStyle, pose: Pose): Pixels {
  const { facing, phase, seated } = pose;
  const frame = blank(FRAME_W, FRAME_H);
  const dy = seated ? 2 : 0;
  const torso = TORSO[facing === 'left' ? 'side' : 'front'];
  overPart(frame, torso, X0, TORSO_Y + dy, (ch, x, y) => {
    if (ch === 'K') return 'K';
    if (ch === '4') return null; // mãos ficam de fora
    const sleeve = facing === 'left' ? x === 5 && y >= 2 : x === 1 || x === 10;
    if (style === 'hoodie') {
      if (facing !== 'up' && facing !== 'left' && y === 4 && x >= 4 && x <= 7) return 'A'; // bolso
      if (facing === 'down' && y >= 1 && y <= 3 && (x === 5 || x === 6)) return 'F'; // cordão
      return sleeve ? 'A' : x >= 8 && facing !== 'left' ? 'C' : 'C';
    }
    if (facing === 'down' && y === 1 && (x === 5 || x === 6)) return 'F'; // gola
    if (sleeve) return 'C';
    return x >= 8 && facing !== 'left' ? 'C' : 'D';
  });
  if (style === 'hoodie') {
    // Capuz caído atrás do pescoço, um pixel mais largo que os ombros.
    const hood = facing === 'left' ? '....KCCCK...' : facing === 'up' ? '.KCCCCCCCCK.' : '.KC......CK.';
    overPart(frame, part('capuz', [hood]), X0, TORSO_Y - 1 + dy, (ch) => ch);
  }
  // Calça escura sobre a pele das pernas; o sapato do corpo continua aparecendo.
  const legPart = seated ? seatedLegs(facing) : legs(facing, phase);
  overPart(frame, legPart, X0, LEGS_Y + dy, (ch, x) => {
    if (ch === '3' || ch === '2') return ch === '2' ? 'k' : x % 4 === 1 ? 'g' : 'n';
    return null;
  });
  return frame;
}

// ---- cabelo ----

type HairStyle = 'short' | 'long' | 'spiky';

function hairShade(x: number, y: number, facing: Facing): string {
  if (y <= 1 && x >= 3 && x <= 5 && facing !== 'up') return '8';
  if (x <= 1 || x >= 10 || y >= 6) return '6';
  return '7';
}

/**
 * Cabelo curto desenhado à mão por direção (a direita é o espelho da esquerda): volume um pixel
 * acima da cabeça, franja com falhas e costeleta. Começa uma linha acima de HEAD_Y.
 */
const SHORT_HAIR: Record<Facing, Pixels> = {
  down: part('cabelo curto de frente', [
    '..KKKKKKKK..',
    '.K77788777K.',
    'K7778888777K',
    'K7777777776K',
    'K767767.766K',
    'K6K......K6K',
    'K6K......K6K',
  ]),
  up: part('cabelo curto de costas', [
    '..KKKKKKKK..',
    '.K77788777K.',
    'K7778887777K',
    'K7777777777K',
    'K7777777777K',
    'K6777777776K',
    'K6677777766K',
    'K6666666666K',
    '.KKKKKKKKKK.',
  ]),
  left: part('cabelo curto de lado', [
    '..KKKKKKKK..',
    '.K77788777K.',
    'K7778887777K',
    'K7777777776K',
    'K76.7777766K',
    'K6...K77766K',
    '.....K7766K.',
    '......KKKK..',
  ]),
};

function hair(style: HairStyle, { facing, seated }: Pose): Pixels {
  const frame = blank(FRAME_W, FRAME_H);
  const dy = seated ? 2 : 0;
  if (style === 'short') {
    stamp(frame, SHORT_HAIR[facing], X0, HEAD_Y - 1 + dy);
    return frame;
  }
  const covers = (x: number, y: number): boolean => {
    const long = style === 'long';
    if (facing === 'up') return y <= (long ? 9 : 7);
    if (facing === 'left') return y <= 2 || (x >= 7 && y <= (long ? 9 : 6)) || (y === 3 && x >= 3);
    return y <= 2 || (y === 3 && (x <= 2 || x >= 9)) || (long && (x <= 1 || x >= 10) && y <= 8);
  };
  overPart(frame, HEAD[facing], X0, HEAD_Y + dy, (ch, x, y) => {
    if (!covers(x, y)) return null;
    return ch === 'K' ? 'K' : hairShade(x, y, facing);
  });
  if (style === 'long' && facing !== 'down') {
    // Cabelo comprido cai sobre as costas, por cima da roupa.
    const fall = facing === 'up' ? ['.K67777776K.', '.K66666666K.', '..KKKKKKKK..'] : ['......K76K..', '......K66K..', '.......KK...'];
    stamp(frame, part('cabelo comprido', fall), X0, TORSO_Y + dy);
  }
  if (style === 'spiky') {
    stamp(frame, part('espetado', ['...K..K..K..', '..K7KK7KK7K.', '.K77878787K.']), X0, HEAD_Y - 3 + dy);
  }
  return frame;
}

// ---- acessórios ----

type AccessoryStyle = 'glasses' | 'cap';

function accessory(style: AccessoryStyle, { facing, seated }: Pose): Pixels {
  const frame = blank(FRAME_W, FRAME_H);
  const y0 = HEAD_Y + (seated ? 2 : 0);
  if (style === 'glasses') {
    if (facing === 'down') stamp(frame, [['K', 'u', 'K', 'K', 'K', 'K', 'u', 'K']], X0 + 2, y0 + 4);
    if (facing === 'left') stamp(frame, [['K', 'u', 'K', 'K', 'K', 'K']], X0 + 1, y0 + 4);
    return frame;
  }
  // Boné: copa sobre o alto da cabeça e aba para a frente.
  overPart(frame, HEAD[facing], X0, y0, (ch, x, y) => {
    if (y > 2) return null;
    if (ch === 'K') return 'K';
    if (y === 1 && x >= 3 && x <= 5) return 'p';
    return x >= 9 ? 'r' : 'R';
  });
  if (facing === 'down') stamp(frame, [Array.from({ length: 10 }, () => 'r')], X0 + 1, y0 + 3);
  if (facing === 'left') stamp(frame, [['K', 'r', 'r', 'r', 'r', 'r']], X0 - 2, y0 + 3);
  if (facing === 'up') stamp(frame, [['r', 'r']], X0 + 5, y0 + 3);
  return frame;
}

// ---- folha completa ----

type Layer = (pose: Pose) => Pixels;

/** Monta a folha 64x160: linhas 0-3 caminhada por direção, linha 4 sentado (baixo, esquerda, direita, cima). */
function sheet(layer: Layer): Pixels {
  const out = blank(FRAME_W * 4, FRAME_H * 5);
  const frame = (dir: Dir, phase: number, seated: boolean): Pixels => {
    const facing: Facing = dir === 'right' ? 'left' : dir;
    const pixels = layer({ facing, phase, seated });
    return dir === 'right' ? mirror(pixels) : pixels;
  };
  const rows: Dir[] = ['down', 'left', 'right', 'up'];
  rows.forEach((dir, row) => {
    for (let col = 0; col < 4; col++) stamp(out, frame(dir, col, false), col * FRAME_W, row * FRAME_H);
  });
  rows.forEach((dir, col) => stamp(out, frame(dir, 0, true), col * FRAME_W, 4 * FRAME_H));
  return out;
}

export const CHARACTER_SHEETS: Record<string, Pixels> = {
  'body/base': sheet(body),
  'outfit/basic': sheet((pose) => outfit('basic', pose)),
  'outfit/hoodie': sheet((pose) => outfit('hoodie', pose)),
  'hair/short': sheet((pose) => hair('short', pose)),
  'hair/long': sheet((pose) => hair('long', pose)),
  'hair/spiky': sheet((pose) => hair('spiky', pose)),
  'accessory/glasses': sheet((pose) => accessory('glasses', pose)),
  'accessory/cap': sheet((pose) => accessory('cap', pose)),
};
