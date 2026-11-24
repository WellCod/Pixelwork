import { TILESETS, type TilesetId } from './catalog.generated.ts';

// Único lugar que traduz ID de catálogo em caminho (servido a partir de assets/).
export function tilesetImageUrl(id: TilesetId): string {
  return `/tilesets/${id}.png`;
}

/** Camadas do personagem, desenhadas de baixo para cima nesta ordem. */
export type CharacterLayer = 'body' | 'outfit' | 'hair' | 'accessory' | 'headwear' | 'backpack';

export function characterImageUrl(layer: CharacterLayer, id: string): string {
  return `/characters/${layer}/${id}.png`;
}

// Rampas-chave da troca de paleta (docs/art.md, seção 3): ficam fora da paleta de propósito.
export const KEY_RAMPS = {
  skin: ['#ff0001', '#ff0002', '#ff0003', '#ff0004'],
  hair: ['#00ff01', '#00ff02', '#00ff03', '#00ff04'],
  outfit: ['#0001ff', '#0002ff', '#0003ff', '#0004ff'],
} as const;

/** Frame do item `item` (o `item_id` do tile) no tileset; item fora do catálogo é erro. */
export function frameOf(tileset: TilesetId, item: string): number {
  // `items` mapeia frame (chave numérica em string) -> item_id; aqui é a busca ao contrário.
  const entry = Object.entries(TILESETS[tileset].items).find(([, itemId]) => itemId === item);
  if (!entry) throw new Error(`item ${item} não existe no tileset ${tileset}`);
  return Number(entry[0]);
}
