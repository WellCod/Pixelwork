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
  shirt: 'Camisa',
  dress: 'Vestido',
  jacket: 'Jaqueta',
  sweater: 'Suéter',
  curly: 'Cacheado',
  bun: 'Coque',
  afro: 'Black power',
  beanie: 'Gorro',
  bow: 'Laço',
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
  furniture: {
    desk: 'Mesa', chair: 'Cadeira', 'chair-back': 'Cadeira (de costas)', 'chair-left': 'Cadeira (esquerda)',
    'chair-right': 'Cadeira (direita)', printer: 'Impressora', bookshelf: 'Estante', 'bookshelf-tall': 'Estante alta',
    whiteboard: 'Lousa de pé', 'meeting-table': 'Mesa de reunião (peça)', 'meeting-table-long': 'Mesa de reunião',
    'meeting-table-round': 'Mesa redonda', reception: 'Recepção', 'trash-bin': 'Lixeira', 'coat-rack': 'Cabideiro',
    'fire-extinguisher': 'Extintor', 'cardboard-box': 'Caixa', door: 'Porta', sofa: 'Sofazinho',
    'sofa-peach': 'Sofá pêssego', 'sofa-sage': 'Sofá sálvia', 'sofa-blue': 'Sofá azul', 'sofa-l': 'Sofá em L',
    armchair: 'Poltrona', 'coffee-table': 'Mesa de centro', 'beanbag-blue': 'Pufe azul', 'beanbag-pink': 'Pufe rosa',
    'beanbag-yellow': 'Pufe amarelo', 'side-table': 'Mesa lateral', 'floor-lamp': 'Luminária de pé', bench: 'Banco',
    'water-cooler': 'Bebedouro', 'coffee-machine': 'Cafeteira', 'kitchen-chair': 'Cadeira de copa',
    'bar-stool': 'Banqueta', fridge: 'Geladeira', 'kitchen-counter': 'Bancada', 'vending-machine': 'Máquina de lanches',
    plant: 'Planta', 'plant-tall': 'Planta alta', cactus: 'Cacto', monstera: 'Costela-de-adão',
    'snake-plant': 'Espada-de-são-jorge', flowers: 'Flores', ficus: 'Fícus', succulent: 'Suculenta', tree: 'Árvore',
    planter: 'Vaso grande', 'ping-pong': 'Pingue-pongue', foosball: 'Pebolim', arcade: 'Fliperama',
    aquarium: 'Aquário', rug: 'Capacho', sideboard: 'Aparador',
  },
  desk: { basic: 'Madeira clara', dark: 'Madeira escura', white: 'Branca' },
  outfit: { basic: 'Camiseta' },
  skin: { dark: 'Escura' },
  color: { black: 'Preto', dark: 'Escuro' },
};

export function label(id: string, context?: keyof typeof CONTEXT): string {
  return (context && CONTEXT[context]?.[id]) ?? LABELS[id] ?? id;
}
