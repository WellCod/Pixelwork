import type { TilesetId } from './catalog.generated.ts';

// Único lugar que traduz ID de catálogo em caminho (servido a partir de assets/).
export function tilesetImageUrl(id: TilesetId): string {
  return `/tilesets/${id}.png`;
}
