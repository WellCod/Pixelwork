import { TILESETS, tilesetImageUrl, type TilesetId } from '@pixelwork/shared';

type Json = Record<string, unknown>;

export interface TiledObject {
  gid?: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  properties?: { name: string; value: unknown }[];
}

const GID_MASK = 0x0fffffff;

/**
 * O Phaser não lê tileset externo (`source`). O mapa salvo segue o contrato com tilesets
 * do catálogo, e aqui eles viram tilesets embutidos só para a renderização.
 */
export function embedTilesets(map: Json): Json {
  const refs = (map.tilesets as { firstgid: number; source: string }[]).map((ref) => {
    const id = ref.source.replace(/\.tsj$/, '') as TilesetId;
    const meta = TILESETS[id];
    return {
      firstgid: ref.firstgid,
      name: id,
      image: tilesetImageUrl(id),
      imagewidth: meta.columns * meta.tileWidth,
      imageheight: Math.ceil(meta.tilecount / meta.columns) * meta.tileHeight,
      tilewidth: meta.tileWidth,
      tileheight: meta.tileHeight,
      columns: meta.columns,
      tilecount: meta.tilecount,
      margin: 0,
      spacing: 0,
    };
  });
  return { ...map, tilesets: refs };
}

export function objectLayer(map: Json, name: string): TiledObject[] {
  const layers = map.layers as { name: string; objects?: TiledObject[] }[];
  return layers.find((l) => l.name === name)?.objects ?? [];
}

export function prop(object: TiledObject, name: string): unknown {
  return object.properties?.find((p) => p.name === name)?.value;
}

/** gid -> tileset e frame, considerando o firstgid de cada tileset referenciado. */
export function resolveGid(map: Json, gid: number): { id: TilesetId; frame: number } | null {
  const clean = gid & GID_MASK;
  let best: { firstgid: number; source: string } | null = null;
  for (const ref of map.tilesets as { firstgid: number; source: string }[]) {
    if (ref.firstgid <= clean && (!best || ref.firstgid > best.firstgid)) best = ref;
  }
  if (!best || clean === 0) return null;
  return { id: best.source.replace(/\.tsj$/, '') as TilesetId, frame: clean - best.firstgid };
}
