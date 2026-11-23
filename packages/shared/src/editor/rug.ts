// Tapetes pintados na camada `floor` (docs/art.md): cada tapete tem 16 tiles no tileset de pisos,
// um para cada combinação de bordas, então qualquer retângulo, até 1x1, fecha a borda certinho.
import { frameOf } from '../assets.ts';
import type { EditorCommand, TiledDoc, TilesetRef } from './commands.ts';

export type RugId = 'lavender' | 'sage' | 'cream';

/** Primeiro frame de cada tapete no tileset `floors` (o do item `rug-<cor>`); o frame é `first + máscara`. */
export const RUGS: Record<RugId, { first: number }> = {
  lavender: { first: frameOf('floors', 'rug-lavender') },
  sage: { first: frameOf('floors', 'rug-sage') },
  cream: { first: frameOf('floors', 'rug-cream') },
};

/** Bordas de fora do retângulo `width`x`height` no tile (x, y) relativo: N=1, S=2, O=4, L=8. */
export function rugMask(x: number, y: number, width: number, height: number): number {
  // Um bit por borda; numa fileira ou coluna única os dois bits opostos acendem juntos.
  return (y === 0 ? 1 : 0) | (y === height - 1 ? 2 : 0) | (x === 0 ? 4 : 0) | (x === width - 1 ? 8 : 0);
}

/** Pinta o tapete no retângulo entre dois cantos (em qualquer ordem), recortado ao mapa. */
export function paintRug(doc: TiledDoc, rug: RugId, x0: number, y0: number, x1: number, y1: number): EditorCommand | null {
  const left = Math.max(0, Math.min(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const right = Math.min(doc.width - 1, Math.max(x0, x1));
  const bottom = Math.min(doc.height - 1, Math.max(y0, y1));
  if (right < left || bottom < top) return null;
  const floorsRef = ((doc.tilesets as TilesetRef[] | undefined) ?? []).find((tilesetRef) => tilesetRef.source === 'floors.tsj');
  const floorLayer = doc.layers.find((layer) => layer.name === 'floor');
  if (!floorsRef || floorLayer?.type !== 'tilelayer') return null;
  const rugWidth = right - left + 1;
  const rugHeight = bottom - top + 1;
  const cells: { i: number; gid: number }[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      // gid = início do tileset no mapa + primeiro frame do tapete + máscara das bordas deste tile.
      const gid = floorsRef.firstgid + RUGS[rug].first + rugMask(x - left, y - top, rugWidth, rugHeight);
      const tileIndex = y * doc.width + x;
      // Só entra no comando o que muda, para repintar o mesmo tapete não empilhar desfazer vazio.
      if (floorLayer.data[tileIndex] !== gid) cells.push({ i: tileIndex, gid });
    }
  }
  return cells.length > 0 ? { kind: 'paint', layer: 'floor', cells } : null;
}
