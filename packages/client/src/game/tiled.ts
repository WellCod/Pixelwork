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

/** Os 4 bits altos do gid do Tiled são flags de espelhamento e rotação; o resto é o tile. */
const GID_MASK = 0x0fffffff;

/**
 * O Phaser não lê tileset externo (`source`). O mapa salvo segue o contrato com tilesets
 * do catálogo, e aqui eles viram tilesets embutidos só para a renderização.
 */
export function embedTilesets(map: Json): Json {
  const embedded = (map.tilesets as { firstgid: number; source: string }[]).map((reference) => {
    const id = reference.source.replace(/\.tsj$/, '') as TilesetId;
    const tileset = TILESETS[id];
    return {
      firstgid: reference.firstgid,
      name: id,
      image: tilesetImageUrl(id),
      imagewidth: tileset.columns * tileset.tileWidth,
      imageheight: Math.ceil(tileset.tilecount / tileset.columns) * tileset.tileHeight,
      tilewidth: tileset.tileWidth,
      tileheight: tileset.tileHeight,
      columns: tileset.columns,
      tilecount: tileset.tilecount,
      margin: 0,
      spacing: 0,
    };
  });
  return { ...map, tilesets: embedded };
}

/** Objetos da camada de objetos com esse nome (vazio se ela não existir). */
export function objectLayer(map: Json, name: string): TiledObject[] {
  const layers = map.layers as { name: string; objects?: TiledObject[] }[];
  return layers.find((layer) => layer.name === name)?.objects ?? [];
}

/** Valor da propriedade customizada do objeto, ou undefined. */
export function prop(object: TiledObject, name: string): unknown {
  return object.properties?.find((property) => property.name === name)?.value;
}

/**
 * gid -> tileset e frame, considerando o firstgid de cada tileset referenciado. O dono do gid é
 * o tileset de maior firstgid que não passa dele; gid 0 é tile vazio.
 */
export function resolveGid(map: Json, gid: number): { id: TilesetId; frame: number } | null {
  const tileGid = gid & GID_MASK;
  let owner: { firstgid: number; source: string } | null = null;
  for (const reference of map.tilesets as { firstgid: number; source: string }[]) {
    if (reference.firstgid <= tileGid && (!owner || reference.firstgid > owner.firstgid)) owner = reference;
  }
  if (!owner || tileGid === 0) return null;
  return { id: owner.source.replace(/\.tsj$/, '') as TilesetId, frame: tileGid - owner.firstgid };
}
