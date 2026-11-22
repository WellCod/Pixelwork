// Tapetes pintados na camada `floor` (docs/art.md): cada tapete tem 16 tiles no tileset de pisos,
// um para cada combinação de bordas, então qualquer retângulo, até 1x1, fecha a borda certinho.
import type { EditorCommand, TiledDoc, TilesetRef } from './commands.ts';

export type RugId = 'lavender' | 'sage' | 'cream';

/** Primeiro frame de cada tapete no tileset `floors`; o frame é `first + máscara`. */
export const RUGS: Record<RugId, { first: number }> = {
  lavender: { first: 5 },
  sage: { first: 21 },
  cream: { first: 37 },
};

/** Bordas de fora do retângulo `w`x`h` no tile (x, y) relativo: N=1, S=2, O=4, L=8. */
export function rugMask(x: number, y: number, w: number, h: number): number {
  return (y === 0 ? 1 : 0) | (y === h - 1 ? 2 : 0) | (x === 0 ? 4 : 0) | (x === w - 1 ? 8 : 0);
}

/** Pinta o tapete no retângulo entre dois cantos (em qualquer ordem), recortado ao mapa. */
export function paintRug(doc: TiledDoc, rug: RugId, x0: number, y0: number, x1: number, y1: number): EditorCommand | null {
  const left = Math.max(0, Math.min(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const right = Math.min(doc.width - 1, Math.max(x0, x1));
  const bottom = Math.min(doc.height - 1, Math.max(y0, y1));
  if (right < left || bottom < top) return null;
  const floors = ((doc.tilesets as TilesetRef[] | undefined) ?? []).find((t) => t.source === 'floors.tsj');
  const layer = doc.layers.find((l) => l.name === 'floor');
  if (!floors || layer?.type !== 'tilelayer') return null;
  const w = right - left + 1;
  const h = bottom - top + 1;
  const cells: { i: number; gid: number }[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const gid = floors.firstgid + RUGS[rug].first + rugMask(x - left, y - top, w, h);
      const i = y * doc.width + x;
      if (layer.data[i] !== gid) cells.push({ i, gid });
    }
  }
  return cells.length > 0 ? { kind: 'paint', layer: 'floor', cells } : null;
}
