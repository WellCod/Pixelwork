// Operações do editor: montam comandos a partir do documento atual. Devolvem null quando não
// há o que mudar, para não empilhar desfazer vazio.
import { TILESETS, TILESET_IDS, type TilesetId } from '../catalog.generated.ts';
import { TILE_PX } from '../constants.ts';
import type { Dir } from '../protocol.ts';
import {
  objectLayer,
  prop,
  type EditorCommand,
  type ObjectLayerName,
  type TiledDoc,
  type TiledObject,
  type TiledProperty,
  type TilesetRef,
  type TileLayerName,
} from './commands.ts';

export type ZoneType = 'open' | 'meeting';

/**
 * Contadores guardados nas propriedades do mapa: uma chave apagada nunca volta para um objeto
 * novo, senão uma atribuição de mesa antiga cairia numa mesa diferente.
 */
const COUNTERS = { zone: 'pixelwork_next_zone', desk: 'pixelwork_next_desk' } as const;
const PREFIX = { zone: 'zona', desk: 'mesa' } as const;
const KEY_PROP = { zone: 'zone_key', desk: 'desk_key' } as const;
const LAYER = { zone: 'zones', desk: 'desks' } as const;
const CLOCKWISE: Record<Dir, Dir> = { up: 'right', right: 'down', down: 'left', left: 'up' };

const inside = (doc: TiledDoc, x: number, y: number) => x >= 0 && y >= 0 && x < doc.width && y < doc.height;
/** Pegada em pixels (canto superior esquerdo em x, y) cabe inteira no mapa. */
const fits = (doc: TiledDoc, x: number, y: number, width: number, height: number) =>
  x >= 0 && y >= 0 && x + width <= doc.width * TILE_PX && y + height <= doc.height * TILE_PX;

function allObjects(doc: TiledDoc): TiledObject[] {
  return doc.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects : []));
}

function nextObjectId(doc: TiledDoc): number {
  const max = Math.max(0, ...allObjects(doc).map((o) => o.id));
  return Math.max(doc.nextobjectid ?? 0, max + 1);
}

function nextKeyNumber(doc: TiledDoc, kind: 'zone' | 'desk'): number {
  const stored = Number(prop(doc, COUNTERS[kind]));
  const pattern = new RegExp(`^${PREFIX[kind]}-(\\d+)$`);
  const used = objectLayer(doc, LAYER[kind]).objects.map((o) => {
    const key = prop(o, KEY_PROP[kind]);
    const match = typeof key === 'string' ? pattern.exec(key) : null;
    return match ? Number(match[1]) : 0;
  });
  return Math.max(Number.isFinite(stored) ? stored : 0, ...used.map((n) => n + 1), 1);
}

function withProp(properties: TiledProperty[] | undefined, name: string, value: string): TiledProperty[] {
  const list = [...(properties ?? [])];
  const index = list.findIndex((p) => p.name === name);
  const entry = { name, type: 'string', value };
  if (index >= 0) list[index] = entry;
  else list.push(entry);
  return list;
}

function baseObject(id: number, extra: Partial<TiledObject>): TiledObject {
  return { id, name: '', type: '', x: 0, y: 0, width: 0, height: 0, rotation: 0, visible: true, ...extra };
}

/** Novo objeto com id e, quando é zona ou mesa, chave nova; o contador vai junto no comando. */
function addWithKey(
  doc: TiledDoc,
  layer: ObjectLayerName,
  build: (id: number, key: string | null) => TiledObject,
  kind?: 'zone' | 'desk',
): EditorCommand {
  const id = nextObjectId(doc);
  let properties = doc.properties;
  let key: string | null = null;
  if (kind) {
    const n = nextKeyNumber(doc, kind);
    key = `${PREFIX[kind]}-${n}`;
    properties = withProp(properties, COUNTERS[kind], String(n + 1));
  }
  return {
    kind: 'batch',
    commands: [
      {
        kind: 'setDocFields',
        fields: kind ? { nextobjectid: id + 1, properties } : { nextobjectid: id + 1 },
      },
      { kind: 'addObject', layer, object: build(id, key) },
    ],
  };
}

function find(doc: TiledDoc, layer: ObjectLayerName, id: number): TiledObject {
  const object = objectLayer(doc, layer).objects.find((o) => o.id === id);
  if (!object) throw new Error(`objeto ${id} não existe na camada ${layer}`);
  return object;
}

function setProps(object: TiledObject, values: Record<string, string>): TiledObject {
  let properties = object.properties;
  for (const [name, value] of Object.entries(values)) properties = withProp(properties, name, value);
  return properties ? { ...object, properties } : object;
}

// ---- tiles ----

/** Pincel e borracha (gid 0): um traço inteiro vira um comando só. */
export function paint(doc: TiledDoc, layer: TileLayerName, tiles: readonly [number, number][], gid: number): EditorCommand | null {
  const target = doc.layers.find((l) => l.name === layer && l.type === 'tilelayer');
  if (target?.type !== 'tilelayer') return null;
  const seen = new Set<number>();
  const cells: { i: number; gid: number }[] = [];
  for (const [x, y] of tiles) {
    if (!inside(doc, x, y)) continue;
    const i = y * doc.width + x;
    if (seen.has(i) || target.data[i] === gid) continue;
    seen.add(i);
    cells.push({ i, gid });
  }
  return cells.length > 0 ? { kind: 'paint', layer, cells } : null;
}

// ---- móveis ----

/** Objetos de tile do Tiled ficam ancorados no canto inferior esquerdo. */
/**
 * Móvel do `frame` do `tileset`, ancorado no canto inferior esquerdo do tile clicado, com o
 * tamanho da célula do tileset. Mapa salvo antes do tileset existir ganha a referência (bloco de
 * 100 gids na ordem do catálogo) no mesmo comando, então desfazer volta o documento exato.
 */
export function placeFurniture(doc: TiledDoc, tileset: TilesetId, frame: number, tx: number, ty: number): EditorCommand | null {
  if (!inside(doc, tx, ty)) return null;
  const refs = (doc.tilesets as TilesetRef[] | undefined) ?? [];
  const source = `${tileset}.tsj`;
  const existing = refs.find((r) => r.source === source);
  const firstgid = existing?.firstgid ?? 1 + TILESET_IDS.indexOf(tileset) * 100;
  const { tileWidth, tileHeight } = TILESETS[tileset];
  const add = addWithKey(doc, 'furniture', (id) =>
    baseObject(id, { gid: firstgid + frame, x: tx * TILE_PX, y: (ty + 1) * TILE_PX, width: tileWidth, height: tileHeight }),
  );
  if (existing) return add;
  const tilesets = [...refs, { firstgid, source }].sort((a, b) => a.firstgid - b.firstgid);
  return { kind: 'batch', commands: [{ kind: 'setDocFields', fields: { tilesets } }, add] };
}

// ---- zonas ----

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampRect(doc: TiledDoc, rect: TileRect): TileRect | null {
  const x0 = Math.max(0, Math.min(rect.x, rect.x + rect.w - 1));
  const y0 = Math.max(0, Math.min(rect.y, rect.y + rect.h - 1));
  const x1 = Math.min(doc.width - 1, Math.max(rect.x, rect.x + rect.w - 1));
  const y1 = Math.min(doc.height - 1, Math.max(rect.y, rect.y + rect.h - 1));
  return x1 >= x0 && y1 >= y0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null;
}

export function addZone(doc: TiledDoc, rect: TileRect, type: ZoneType, name: string): EditorCommand | null {
  const r = clampRect(doc, rect);
  if (!r) return null;
  return addWithKey(
    doc,
    'zones',
    (id, key) =>
      baseObject(id, {
        x: r.x * TILE_PX,
        y: r.y * TILE_PX,
        width: r.w * TILE_PX,
        height: r.h * TILE_PX,
        properties: [
          { name: 'zone_key', type: 'string', value: key ?? '' },
          { name: 'type', type: 'string', value: type },
          { name: 'name', type: 'string', value: name },
        ],
      }),
    'zone',
  );
}

export function resizeZone(doc: TiledDoc, id: number, rect: TileRect): EditorCommand | null {
  const r = clampRect(doc, rect);
  if (!r) return null;
  const zone = find(doc, 'zones', id);
  const next = { ...zone, x: r.x * TILE_PX, y: r.y * TILE_PX, width: r.w * TILE_PX, height: r.h * TILE_PX };
  if (next.x === zone.x && next.y === zone.y && next.width === zone.width && next.height === zone.height) return null;
  return { kind: 'replaceObject', layer: 'zones', object: next };
}

export function setZoneProps(doc: TiledDoc, id: number, values: { name?: string; type?: ZoneType }): EditorCommand | null {
  const zone = find(doc, 'zones', id);
  const changes = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => prop(zone, k) !== v),
  ) as Record<string, string>;
  if (Object.keys(changes).length === 0) return null;
  return { kind: 'replaceObject', layer: 'zones', object: setProps(zone, changes) };
}

// ---- mesas ----

export function addDesk(doc: TiledDoc, tx: number, ty: number, orientation: Dir): EditorCommand | null {
  const size = deskSize(orientation, 2);
  if (!fits(doc, tx * TILE_PX, ty * TILE_PX, size.width, size.height)) return null;
  return addWithKey(
    doc,
    'desks',
    (id, key) =>
      baseObject(id, {
        x: tx * TILE_PX,
        y: ty * TILE_PX,
        // Mesa nova é a larga: 2 tiles de frente para a cadeira (docs/architecture.md, seção 6).
        ...size,
        properties: [
          { name: 'desk_key', type: 'string', value: key ?? '' },
          { name: 'orientation', type: 'string', value: orientation },
        ],
      }),
    'desk',
  );
}

/** Largura e altura em pixels da mesa de `tiles` tiles virada para `orientation`. */
function deskSize(orientation: Dir, tiles: 1 | 2): { width: number; height: number } {
  const across = orientation === 'up' || orientation === 'down';
  return { width: (across ? tiles : 1) * TILE_PX, height: (across ? 1 : tiles) * TILE_PX };
}

/** Gira no sentido horário; a mesa larga troca largura e altura para continuar de frente. */
export function rotateDesk(doc: TiledDoc, id: number): EditorCommand | null {
  const desk = find(doc, 'desks', id);
  const current = prop(desk, 'orientation');
  const next = CLOCKWISE[(current as Dir | undefined) ?? 'down'];
  const tiles = Math.max(desk.width, desk.height) > TILE_PX ? 2 : 1;
  const rotated = { ...setProps(desk, { orientation: next }), ...deskSize(next, tiles) };
  // Na borda do mapa, girar a mesa larga poria um tile para fora: não gira.
  if (!fits(doc, rotated.x, rotated.y, rotated.width, rotated.height)) return null;
  return { kind: 'replaceObject', layer: 'desks', object: rotated };
}

// ---- comuns ----

/** Move mantendo a chave (zone_key, desk_key): é por ela que trancas e atribuições acham o objeto. */
export function moveObject(doc: TiledDoc, layer: ObjectLayerName, id: number, tx: number, ty: number): EditorCommand | null {
  const object = find(doc, layer, id);
  let x = tx * TILE_PX;
  let y = ty * TILE_PX;
  if (layer === 'furniture') y += TILE_PX;
  if (layer === 'spawn') {
    x += TILE_PX / 2;
    y += TILE_PX / 2;
  }
  if (!inside(doc, tx, ty)) return null;
  // Zona e mesa inteiras têm que caber no mapa depois de mover.
  if ((layer === 'zones' || layer === 'desks') && !fits(doc, x, y, object.width || TILE_PX, object.height || TILE_PX)) return null;
  if (x === object.x && y === object.y) return null;
  return { kind: 'replaceObject', layer, object: { ...object, x, y } };
}

export function removeObject(doc: TiledDoc, layer: ObjectLayerName, id: number): EditorCommand {
  find(doc, layer, id);
  return { kind: 'removeObject', layer, id };
}

/** Spawn é um ponto só: move o que existe ou cria. */
export function moveSpawn(doc: TiledDoc, tx: number, ty: number): EditorCommand | null {
  if (!inside(doc, tx, ty)) return null;
  const spawn = objectLayer(doc, 'spawn').objects[0];
  if (spawn) return moveObject(doc, 'spawn', spawn.id, tx, ty);
  return addWithKey(doc, 'spawn', (id) =>
    baseObject(id, { x: tx * TILE_PX + TILE_PX / 2, y: ty * TILE_PX + TILE_PX / 2, point: true }),
  );
}

/** Objeto sob um tile, para a ferramenta de selecionar, mover e remover. */
export function objectAt(doc: TiledDoc, layer: ObjectLayerName, tx: number, ty: number): TiledObject | undefined {
  const objects = objectLayer(doc, layer).objects;
  const px = tx * TILE_PX;
  const py = ty * TILE_PX;
  return [...objects].reverse().find((o) => {
    if (layer === 'zones') return px >= o.x && px < o.x + o.width && py >= o.y && py < o.y + o.height;
    // Móvel ancorado no canto inferior esquerdo: a pegada sobe `height` a partir de `y`.
    if (layer === 'furniture') {
      const w = o.width || TILE_PX;
      const h = o.height || TILE_PX;
      return px >= o.x && px < o.x + w && py >= o.y - h && py < o.y;
    }
    // Mesa ancorada no canto superior esquerdo: a pegada desce `height` a partir de `y`.
    const w = o.width || TILE_PX;
    const h = o.height || TILE_PX;
    return px >= o.x && px < o.x + w && py >= o.y && py < o.y + h;
  });
}

/**
 * Troca o documento em edição por outro (o modelo) sem reaproveitar chave do mapa atual. Toda
 * chave do documento novo com número já usado no atual (abaixo do contador dele) ganha um número
 * novo: a mesa "mesa-1" do modelo é outra mesa, e a atribuição antiga aparece como órfã ao salvar
 * em vez de ser herdada por uma mesa em outro lugar.
 */
export function adoptDocument(current: TiledDoc, incoming: TiledDoc): TiledDoc {
  const doc = JSON.parse(JSON.stringify(incoming)) as TiledDoc;
  for (const kind of ['zone', 'desk'] as const) {
    const pattern = new RegExp(`^${PREFIX[kind]}-(\\d+)$`);
    const carried = nextKeyNumber(current, kind);
    let next = Math.max(carried, nextKeyNumber(doc, kind));
    for (const object of objectLayer(doc, LAYER[kind]).objects) {
      const key = prop(object, KEY_PROP[kind]);
      const match = typeof key === 'string' ? pattern.exec(key) : null;
      if (!match || Number(match[1]) >= carried) continue;
      object.properties = withProp(object.properties, KEY_PROP[kind], `${PREFIX[kind]}-${next}`);
      next++;
    }
    doc.properties = withProp(doc.properties, COUNTERS[kind], String(next));
  }
  return doc;
}
