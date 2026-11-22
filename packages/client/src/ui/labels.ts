/**
 * Nomes em português dos IDs do catálogo. O catálogo só cresce (invariante 7): ID novo sem
 * entrada aqui aparece com o próprio ID até ganhar nome.
 */
const LABELS: Record<string, string> = {
  // corpo, cabelo, roupa, acessório
  base: 'Padrão',
  short: 'Curto',
  long: 'Comprido',
  spiky: 'Espetado',
  hoodie: 'Moletom',
  glasses: 'Óculos',
  cap: 'Boné',
  // pele
  light: 'Clara',
  medium: 'Média',
  pale: 'Muito clara',
  tan: 'Morena',
  deep: 'Retinta',
  // cores
  brown: 'Castanho',
  blond: 'Loiro',
  red: 'Vermelho',
  gray: 'Cinza',
  pink: 'Rosa',
  blue: 'Azul',
  green: 'Verde',
  purple: 'Roxo',
  yellow: 'Amarelo',
  cream: 'Creme',
  // mesa e decoração
  mug: 'Caneca',
  lamp: 'Luminária',
  books: 'Livros',
  poster: 'Pôster',
  clock: 'Relógio',
  'plant-small': 'Plantinha',
  bin: 'Lixeira',
  'pencil-cup': 'Porta-lápis',
  headphones: 'Fone',
  'cactus-mini': 'Cactinho',
  photo: 'Porta-retrato',
  'water-bottle': 'Garrafinha',
  'sticky-notes': 'Post-its',
  speaker: 'Caixinha de som',
  'takeaway-coffee': 'Café para viagem',
  trophy: 'Troféu',
  duck: 'Patinho',
  calendar: 'Calendário',
  'shelf-mini': 'Prateleira',
  'framed-photo': 'Foto emoldurada',
  backpack: 'Mochila',
  'vase-tall': 'Vaso de flores',
  cat: 'Gato dormindo',
  single: 'Monitor',
  dual: 'Dois monitores',
  laptop: 'Notebook',
};

/** Rótulos que mudam conforme o contexto (mesa escura x pele escura x roupa básica). */
const CONTEXT: Record<string, Record<string, string>> = {
  desk: { basic: 'Madeira clara', dark: 'Madeira escura', white: 'Branca' },
  outfit: { basic: 'Camiseta' },
  skin: { dark: 'Escura' },
  color: { black: 'Preto', dark: 'Escuro' },
};

export function label(id: string, context?: keyof typeof CONTEXT): string {
  return (context && CONTEXT[context]?.[id]) ?? LABELS[id] ?? id;
}
