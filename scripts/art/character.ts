// Personagem em camadas (docs/art.md, seção 4): frame 16x32, 4 colunas x 5 linhas.
// Todas as camadas são derivadas da mesma silhueta do corpo, então encaixam pixel a pixel.
// Cores do corpo e do cabelo usam as rampas-chave (troca de paleta no cliente).
import { blank, grid, mirror, stamp, type Pixels } from '../lib/pixels.ts';

// Cada parte (cabeça, tronco, pernas) tem 12 px de largura e entra na coluna X0 do frame de 16 px;
// HEAD_Y, TORSO_Y e LEGS_Y são as linhas onde cada parte começa no personagem em pé.
const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 32;
const PART_WIDTH = 12;
const X0 = 2;
const HEAD_Y = 8;
const TORSO_Y = 18;
const LEGS_Y = 25;

type Facing = 'down' | 'up' | 'left';
type Dir = Facing | 'right';
const part = (label: string, rows: string[]) => grid(rows, PART_WIDTH, label);

const HEAD: Record<Facing, Pixels> = {
  down: part('cabeça de frente', [
    '..KKKKKKKK..',
    '.K33333333K.',
    'K3333333333K',
    'K3433333343K',
    'K33K3333K33K',
    'K33K3333K33K',
    'K2333333332K',
    'K3333223333K',
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
function leg(target: Pixels, column: number, lift: number, skin = '3'): void {
  const skinRows = 4 - lift;
  for (let row = 0; row < skinRows; row++) stamp(target, [['K', skin, skin, 'K']], column, row);
  stamp(target, [['K', 'k', 'k', 'K']], column, skinRows);
  stamp(target, [['K', 'K', 'K', 'K']], column, skinRows + 1);
}

/** Pernas por fase da caminhada: 0 e 2 parado, 1 e 3 um pé de cada vez. */
function legs(facing: Facing, phase: number): Pixels {
  const legPixels = blank(PART_WIDTH, 6);
  if (facing === 'left') {
    // De lado as pernas se cruzam: a de trás é mais escura e fica por baixo.
    if (phase === 1 || phase === 3) {
      leg(legPixels, phase === 1 ? 6 : 2, 1, '2');
      leg(legPixels, phase === 1 ? 2 : 6, 0);
    } else {
      leg(legPixels, 4, 0);
    }
    return legPixels;
  }
  leg(legPixels, 2, phase === 1 ? 1 : 0);
  leg(legPixels, 6, phase === 3 ? 1 : 0);
  return legPixels;
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
  const frame = blank(FRAME_WIDTH, FRAME_HEIGHT);
  const dy = seated ? 2 : 0; // sentado, o corpo desce 2 px para encaixar na cadeira
  stamp(frame, seated ? seatedLegs(facing) : legs(facing, phase), X0, LEGS_Y + dy);
  stamp(frame, TORSO[facing === 'left' ? 'side' : 'front'], X0, TORSO_Y + dy);
  stamp(frame, HEAD[facing], X0, HEAD_Y + dy);
  return frame;
}

/**
 * Percorre cada pixel preenchido da silhueta `source` (posta em x0, y0) e pinta na camada o que
 * `mapPixel` devolver; null deixa o pixel de fora. É assim que roupa e cabelo seguem o corpo.
 */
function overPart(
  frame: Pixels,
  source: Pixels,
  x0: number,
  y0: number,
  mapPixel: (pixelChar: string, x: number, y: number) => string | null,
): void {
  source.forEach((row, y) =>
    row.forEach((pixelChar, x) => {
      if (pixelChar === '.') return;
      const layerPixel = mapPixel(pixelChar, x, y);
      if (layerPixel !== null) stamp(frame, [[layerPixel]], x0 + x, y0 + y);
    }),
  );
}

// ---- roupa ----

type OutfitStyle = 'basic' | 'hoodie' | 'shirt' | 'dress' | 'jacket' | 'sweater';

/** Camada de roupa: pinta tronco e pernas da silhueta com as cores-chave de roupa (A C D F). */
function outfit(style: OutfitStyle, pose: Pose): Pixels {
  const { facing, phase, seated } = pose;
  const frame = blank(FRAME_WIDTH, FRAME_HEIGHT);
  const dy = seated ? 2 : 0;
  const torso = TORSO[facing === 'left' ? 'side' : 'front'];
  overPart(frame, torso, X0, TORSO_Y + dy, (pixelChar, x, y) => {
    if (pixelChar === 'K') return 'K';
    if (pixelChar === '4') return null; // mãos ficam de fora
    // Manga: a coluna do braço de lado, as colunas das bordas de frente e de costas. Fora dela, a
    // metade direita (x >= 8) fica no tom mais escuro, porque a luz vem da esquerda.
    const sleeve = facing === 'left' ? x === 5 && y >= 2 : x === 1 || x === 10;
    if (style === 'hoodie') {
      if (facing !== 'up' && facing !== 'left' && y === 4 && x >= 4 && x <= 7) return 'A'; // bolso
      if (facing === 'down' && y >= 1 && y <= 3 && (x === 5 || x === 6)) return 'F'; // cordão
      return sleeve ? 'A' : x >= 8 && facing !== 'left' ? 'C' : 'C';
    }
    const facingFront = facing === 'down';
    if (style === 'shirt') {
      if (facingFront && y === 1 && x >= 4 && x <= 7) return x === 4 || x === 7 ? 'F' : 'D'; // gola
      if (facingFront && (x === 5 || x === 6) && y >= 2 && y <= 4) return x === 5 ? 'A' : 'D'; // abotoamento
      return sleeve ? 'C' : x >= 8 && facing !== 'left' ? 'C' : 'D';
    }
    if (style === 'jacket') {
      // Jaqueta aberta: laterais na cor da roupa, camiseta clara por dentro.
      if (facingFront && x >= 4 && x <= 7) return x === 4 || x === 7 ? 'A' : 'F';
      return sleeve ? 'A' : 'C';
    }
    if (style === 'sweater') {
      if (y === 3) return 'F'; // listra
      if (facingFront && y === 1 && x >= 4 && x <= 7) return 'C';
      return sleeve ? 'C' : 'D';
    }
    if (style === 'dress') {
      if (facingFront && y === 1 && x >= 4 && x <= 7) return 'F';
      return sleeve ? 'D' : x >= 8 && facing !== 'left' ? 'C' : 'D';
    }
    if (facing === 'down' && y === 1 && (x === 5 || x === 6)) return 'F'; // gola
    if (sleeve) return 'C';
    return x >= 8 && facing !== 'left' ? 'C' : 'D';
  });
  if (style === 'hoodie') {
    // Capuz caído atrás do pescoço, um pixel mais largo que os ombros.
    const hood = facing === 'left' ? '....KCCCK...' : facing === 'up' ? '.KCCCCCCCCK.' : '.KC......CK.';
    overPart(frame, part('capuz', [hood]), X0, TORSO_Y - 1 + dy, (pixelChar) => pixelChar);
  }
  if (style === 'dress') {
    // Saia em trapézio por cima do alto das pernas; daí para baixo a pele aparece.
    const skirt = facing === 'left' ? ['..KCDDDCK...', '.KCDDDDDCK..', '.KKKKKKKKK..'] : ['.KCDDDDDDCK.', 'KCDDDDDDDDCK', 'KKKKKKKKKKKK'];
    stamp(frame, part('saia', skirt), X0, LEGS_Y + dy - (seated ? 1 : 0));
    return frame;
  }
  // Calça escura sobre a pele das pernas; o sapato do corpo continua aparecendo.
  const legPart = seated ? seatedLegs(facing) : legs(facing, phase);
  overPart(frame, legPart, X0, LEGS_Y + dy, (pixelChar, x) => {
    if (pixelChar === '3' || pixelChar === '2') return pixelChar === '2' ? 'k' : x % 4 === 1 ? 'g' : 'n';
    return null;
  });
  return frame;
}

// ---- cabelo ----

type HairStyle = 'short' | 'long' | 'spiky' | 'curly' | 'bun' | 'afro';

/** Tom do cabelo pela posição na cabeça: brilho no alto à esquerda, sombra nas laterais e embaixo. */
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

/**
 * Cabelos com frente desenhada à mão. `top` é quantas linhas o desenho começa acima de HEAD_Y
 * (volume acima da cabeça) e `dx` o deslocamento horizontal (o black power passa da cabeça).
 * Costas e perfil reaproveitam o volume de cima e cobrem a cabeça até `back` linhas.
 */
const FRONT_HAIR: Partial<Record<HairStyle, { rows: string[]; top: number; dx: number; back: number }>> = {
  curly: {
    top: 2,
    dx: 0,
    back: 8,
    rows: [
      '.KK.KK.KK.K.',
      'K77K77K77K7K',
      'K7777887777K',
      'K7787777877K',
      'K7777777777K',
      'K787.77.787K',
      'K77......77K',
      'K6K......K6K',
    ],
  },
  bun: {
    top: 3,
    dx: 0,
    back: 7,
    rows: [
      '....KKKK....',
      '...K7887K...',
      '..KK6776KK..',
      '.K77788777K.',
      'K7778887777K',
      'K7777777776K',
      'K76......67K',
      'K6K......K6K',
    ],
  },
  afro: {
    top: 3,
    dx: -1,
    back: 9,
    rows: [
      '...KKKKKKKK...',
      '..K77787777K..',
      '.K7787777877K.',
      'K778777777877K',
      'K777778877777K',
      'K787777777787K',
      'K778777777877K',
      'K77K......K77K',
      'K77K......K77K',
      '.KKK......KKK.',
    ],
  },
};

/** Cabelo de `FRONT_HAIR`; null para os estilos que não estão lá. */
function frontHair(style: HairStyle, facing: Facing, dy: number): Pixels | null {
  const spec = FRONT_HAIR[style];
  if (!spec) return null;
  const frame = blank(FRAME_WIDTH, FRAME_HEIGHT);
  const width = spec.rows[0]?.length ?? PART_WIDTH;
  const hairPixels = grid(spec.rows, width, `cabelo ${style}`);
  if (facing === 'down') {
    stamp(frame, hairPixels, X0 + spec.dx, HEAD_Y - spec.top + dy);
    return frame;
  }
  // Volume acima da cabeça igual ao de frente; a cabeça coberta até `back` linhas.
  stamp(frame, hairPixels.slice(0, spec.top), X0 + spec.dx, HEAD_Y - spec.top + dy);
  overPart(frame, HEAD[facing], X0, HEAD_Y + dy, (pixelChar, x, y) => {
    const covered = facing === 'up' ? y <= spec.back : y <= 2 || (x >= 6 && y <= spec.back) || (y === 3 && x >= 3);
    if (!covered) return null;
    return pixelChar === 'K' ? 'K' : hairShade(x, y, facing);
  });
  if (style === 'afro') {
    // Volume lateral do black power, que passa da cabeça.
    const side = facing === 'up' ? ['K7K......K7K'] : ['.......K777K'];
    for (let row = 0; row < 5; row++) stamp(frame, part('volume', side), X0, HEAD_Y + 1 + row + dy);
  }
  return frame;
}

/** Camada de cabelo: curto e os de `FRONT_HAIR` desenhados à mão, os demais cobrindo a silhueta da cabeça. */
function hair(style: HairStyle, { facing, seated }: Pose): Pixels {
  const frame = blank(FRAME_WIDTH, FRAME_HEIGHT);
  const dy = seated ? 2 : 0;
  if (style === 'short') {
    stamp(frame, SHORT_HAIR[facing], X0, HEAD_Y - 1 + dy);
    return frame;
  }
  const front = frontHair(style, facing, dy);
  if (front) return front;
  const covers = (x: number, y: number): boolean => {
    const long = style === 'long';
    if (facing === 'up') return y <= (long ? 9 : 7);
    if (facing === 'left') return y <= 2 || (x >= 7 && y <= (long ? 9 : 6)) || (y === 3 && x >= 3);
    return y <= 2 || (y === 3 && (x <= 2 || x >= 9)) || (long && (x <= 1 || x >= 10) && y <= 8);
  };
  overPart(frame, HEAD[facing], X0, HEAD_Y + dy, (pixelChar, x, y) => {
    if (!covers(x, y)) return null;
    return pixelChar === 'K' ? 'K' : hairShade(x, y, facing);
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

type AccessoryStyle = 'glasses' | 'cap' | 'headphones' | 'beanie' | 'bow';

/** Camada de acessório, presa à cabeça. */
function accessory(style: AccessoryStyle, { facing, seated }: Pose): Pixels {
  const frame = blank(FRAME_WIDTH, FRAME_HEIGHT);
  const y0 = HEAD_Y + (seated ? 2 : 0);
  if (style === 'headphones') {
    // Arco por cima da cabeça e conchas nas orelhas.
    if (facing === 'left') {
      stamp(frame, part('arco de lado', ['....KKKK....', '...K....K...']), X0, y0 - 2);
      stamp(frame, [['K', 'p', 'p', 'K'], ['K', 'p', 'R', 'K'], ['K', 'K', 'K', 'K']], X0 + 6, y0 + 4);
    } else {
      stamp(frame, part('arco', ['..KKKKKKKK..', '.K........K.']), X0, y0 - 2);
      stamp(frame, [['K', 'p'], ['K', 'R'], ['K', 'K']], X0 - 1, y0 + 4);
      stamp(frame, [['p', 'K'], ['R', 'K'], ['K', 'K']], X0 + 11, y0 + 4);
    }
    return frame;
  }
  if (style === 'beanie') {
    // Gorro de lã com barra dobrada e pompom.
    overPart(frame, HEAD[facing], X0, y0, (pixelChar, x, y) => {
      if (y > 3) return null;
      if (pixelChar === 'K' && y < 3) return 'K';
      return y === 3 ? (x % 2 === 0 ? 'U' : 'c') : y === 1 && x >= 3 && x <= 5 ? 'c' : 'U';
    });
    stamp(frame, [['K', 'K', 'K'], ['K', 'W', 'K']], X0 + 4, y0 - 2);
    return frame;
  }
  if (style === 'bow') {
    // Laço de lado, no alto da cabeça.
    const x = facing === 'left' ? X0 + 7 : X0 + 8;
    stamp(frame, [['K', 'K', '.', 'K', 'K'], ['K', 'p', 'K', 'p', 'K'], ['K', 'R', 'K', 'R', 'K'], ['K', 'K', '.', 'K', 'K']], x, y0 - 1);
    return frame;
  }
  if (style === 'glasses') {
    if (facing === 'down') stamp(frame, [['K', 'u', 'K', 'K', 'K', 'K', 'u', 'K']], X0 + 2, y0 + 4);
    if (facing === 'left') stamp(frame, [['K', 'u', 'K', 'K', 'K', 'K']], X0 + 1, y0 + 4);
    return frame;
  }
  // Boné: copa sobre o alto da cabeça e aba para a frente.
  overPart(frame, HEAD[facing], X0, y0, (pixelChar, x, y) => {
    if (y > 2) return null;
    if (pixelChar === 'K') return 'K';
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
  const sheetPixels = blank(FRAME_WIDTH * 4, FRAME_HEIGHT * 5);
  // A direita é a esquerda espelhada: só três direções são desenhadas.
  const poseFrame = (direction: Dir, phase: number, seated: boolean): Pixels => {
    const facing: Facing = direction === 'right' ? 'left' : direction;
    const pixels = layer({ facing, phase, seated });
    return direction === 'right' ? mirror(pixels) : pixels;
  };
  const rowDirections: Dir[] = ['down', 'left', 'right', 'up'];
  rowDirections.forEach((direction, row) => {
    for (let column = 0; column < 4; column++) {
      stamp(sheetPixels, poseFrame(direction, column, false), column * FRAME_WIDTH, row * FRAME_HEIGHT);
    }
  });
  rowDirections.forEach((direction, column) =>
    stamp(sheetPixels, poseFrame(direction, 0, true), column * FRAME_WIDTH, 4 * FRAME_HEIGHT),
  );
  return sheetPixels;
}

const OUTFITS: OutfitStyle[] = ['basic', 'hoodie', 'shirt', 'dress', 'jacket', 'sweater'];
const HAIRS: HairStyle[] = ['short', 'long', 'spiky', 'curly', 'bun', 'afro'];
const ACCESSORIES: AccessoryStyle[] = ['glasses', 'cap', 'headphones', 'beanie', 'bow'];

export const CHARACTER_SHEETS: Record<string, Pixels> = {
  'body/base': sheet(body),
  ...Object.fromEntries(OUTFITS.map((id) => [`outfit/${id}`, sheet((pose) => outfit(id, pose))])),
  ...Object.fromEntries(HAIRS.map((id) => [`hair/${id}`, sheet((pose) => hair(id, pose))])),
  ...Object.fromEntries(ACCESSORIES.map((id) => [`accessory/${id}`, sheet((pose) => accessory(id, pose))])),
};
