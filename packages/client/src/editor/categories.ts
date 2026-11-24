import type { TilesetId } from '@pixelwork/shared';

/**
 * Categorias da paleta de móveis do editor, por `item_id`. É só organização da tela: o contrato
 * do mapa não sabe de categoria. Móvel novo sem entrada aqui aparece em "Outros".
 */
export const CATEGORIES: { label: string; items: readonly string[] }[] = [
  {
    label: 'Escritório',
    items: [
      'desk', 'chair', 'chair-back', 'chair-left', 'chair-right', 'printer', 'bookshelf', 'bookshelf-tall',
      'whiteboard', 'meeting-table', 'meeting-table-long', 'meeting-table-round', 'reception', 'trash-bin',
      'coat-rack', 'fire-extinguisher', 'cardboard-box', 'door',
    ],
  },
  {
    label: 'Sala',
    items: [
      'sofa', 'sofa-peach', 'sofa-sage', 'sofa-blue', 'sofa-l', 'armchair', 'coffee-table', 'beanbag-blue',
      'beanbag-pink', 'beanbag-yellow', 'side-table', 'floor-lamp', 'bench',
    ],
  },
  { label: 'Copa', items: ['water-cooler', 'coffee-machine', 'kitchen-chair', 'bar-stool', 'fridge', 'kitchen-counter', 'vending-machine'] },
  { label: 'Plantas', items: ['plant', 'plant-tall', 'cactus', 'monstera', 'snake-plant', 'flowers', 'ficus', 'succulent', 'tree', 'planter'] },
  { label: 'Lazer', items: ['ping-pong', 'foosball', 'arcade'] },
  { label: 'Decoração', items: ['aquarium', 'rug', 'sideboard'] },
  { label: 'Halloween', items: [
    'halloween-cauldron', 'halloween-candelabra', 'halloween-tombstone', 'halloween-ghost-mat',
    'halloween-familiar-cushion', 'halloween-pumpkin-pair', 'halloween-vampire-sofa', 'halloween-treat-table',
  ] },
];

export interface FurnitureOption {
  tileset: TilesetId;
  frame: number;
  item: string;
}

/** Agrupa as opções pelas categorias, na ordem delas; o que sobra vai para "Outros". */
export function categorize(options: readonly FurnitureOption[]): { label: string; items: FurnitureOption[] }[] {
  const placed = new Set<FurnitureOption>();
  const groups = CATEGORIES.map((category) => {
    const items = options.filter((option) => category.items.includes(option.item) && !placed.has(option));
    for (const option of items) placed.add(option);
    return { label: category.label, items };
  });
  groups.push({ label: 'Outros', items: options.filter((option) => !placed.has(option)) });
  return groups.filter((group) => group.items.length > 0);
}
