// Operações do editor: montam comandos a partir do documento atual. Devolvem null quando não
// há o que mudar, para não empilhar desfazer vazio.
import { TILESETS, TILESET_IDS, type TilesetId } from '../catalog.generated.ts';
import { TILE_PX } from '../constants.ts';
import type { ZoneType } from '../map.ts';

// Declarado no map.ts (uma fonte só); o editor reexporta porque o cliente importa daqui.
export type { ZoneType };
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


/**
 * Contadores guardados nas propriedades do mapa: uma chave apagada nunca volta para um objeto
 * novo, senão uma atribuição de mesa antiga cairia numa mesa diferente.
 */
const COUNTERS = { zone: 'pixelwork_next_zone', desk: 'pixelwork_next_desk' } as const;
/** Prefixo das chaves geradas: `zona-<n>` e `mesa-<n>`. */
const PREFIX = { zone: 'zona', desk: 'mesa' } as const;
const KEY_PROP = { zone: 'zone_key', desk: 'desk_key' } as const;
const LAYER = { zone: 'zones', desk: 'desks' } as const;
const CLOCKWISE: Record<Dir, Dir> = { up: 'right', right: 'down', down: 'left', left: 'up' };

const inside = (doc: TiledDoc, x: number, y: number) => x >= 0 && y >= 0 && x < doc.width && y < doc.height;
/** Pegada em pixels (canto superior esquerdo em x, y) cabe inteira no mapa. */
const fits = (doc: TiledDoc, x: number, y: number, width: number, height: number) =>
  x >= 0 && y >= 0 && x + width <= doc.width * TILE_PX && y + height <= doc.height * TILE_PX;

function allObjects(doc: TiledDoc): TiledObject[] {
  return doc.layers.flatMap((layer) => (layer.type === 'objectgroup' ? layer.objects : []));
}

/** Próximo id de objeto livre: o maior entre o `nextobjectid` do mapa e o maior id em uso + 1. */
function nextObjectId(doc: TiledDoc): number {
  const highestId = Math.max(0, ...allObjects(doc).map((object) => object.id));
  return Math.max(doc.nextobjectid ?? 0, highestId + 1);
}

/**
 * Próximo número de chave (`zona-<n>`/`mesa-<n>`): o maior entre o contador guardado no mapa e
 * o maior número em uso + 1, nunca abaixo de 1. Chaves fora do padrão não contam.
 */
function nextKeyNumber(doc: TiledDoc, kind: 'zone' | 'desk'): number {
  const storedCounter = Number(prop(doc, COUNTERS[kind]));
  const pattern = new RegExp(`^${PREFIX[kind]}-(\\d+)$`);
  const usedNumbers = objectLayer(doc, LAYER[kind]).objects.map((object) => {
    const key = prop(object, KEY_PROP[kind]);
    const match = typeof key === 'string' ? pattern.exec(key) : null;
    return match ? Number(match[1]) : 0;
  });
  return Math.max(Number.isFinite(storedCounter) ? storedCounter : 0, ...usedNumbers.map((usedNumber) => usedNumber + 1), 1);
}

/** Cópia da lista de propriedades com `name` criada ou trocada para `value` (string). */
function withProp(properties: TiledProperty[] | undefined, name: string, value: string): TiledProperty[] {
  const updated = [...(properties ?? [])];
  const index = updated.findIndex((property) => property.name === name);
  const entry = { name, type: 'string', value };
  if (index >= 0) updated[index] = entry;
  else updated.push(entry);
  return updated;
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
    const keyNumber = nextKeyNumber(doc, kind);
    key = `${PREFIX[kind]}-${keyNumber}`;
    properties = withProp(properties, COUNTERS[kind], String(keyNumber + 1));
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

/** Objeto pelo id na camada; ausente é erro (a interface só pede ids que existem). */
function findObject(doc: TiledDoc, layer: ObjectLayerName, id: number): TiledObject {
  const object = objectLayer(doc, layer).objects.find((candidate) => candidate.id === id);
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
  const targetLayer = doc.layers.find((candidate) => candidate.name === layer && candidate.type === 'tilelayer');
  if (targetLayer?.type !== 'tilelayer') return null;
  // Um traço passa várias vezes pelo mesmo tile; cada tile entra no comando uma vez só.
  const seenTiles = new Set<number>();
  const cells: { i: number; gid: number }[] = [];
  for (const [x, y] of tiles) {
    if (!inside(doc, x, y)) continue;
    const tileIndex = y * doc.width + x;
    if (seenTiles.has(tileIndex) || targetLayer.data[tileIndex] === gid) continue;
    seenTiles.add(tileIndex);
    cells.push({ i: tileIndex, gid });
  }
  return cells.length > 0 ? { kind: 'paint', layer, cells } : null;
}

// ---- móveis ----

/**
 * Móvel do `frame` do `tileset`, ancorado no canto inferior esquerdo do tile clicado, com o
 * tamanho da célula do tileset. Mapa salvo antes do tileset existir ganha a referência (bloco de
 * 100 gids na ordem do catálogo) no mesmo comando, então desfazer volta o documento exato.
 */
export function placeFurniture(doc: TiledDoc, tileset: TilesetId, frame: number, tx: number, ty: number): EditorCommand | null {
  const { tileWidth, tileHeight } = TILESETS[tileset];
  // Objeto de tile do Tiled fica ancorado no canto inferior esquerdo: a pegada sobe a partir dele.
  if (!fits(doc, tx * TILE_PX, (ty + 1) * TILE_PX - tileHeight, tileWidth, tileHeight)) return null;
  const tilesetRefs = (doc.tilesets as TilesetRef[] | undefined) ?? [];
  const source = `${tileset}.tsj`;
  const existing = tilesetRefs.find((tilesetRef) => tilesetRef.source === source);
  const firstgid = existing?.firstgid ?? freeFirstgid(tilesetRefs, tileset);
  const addCommand = addWithKey(doc, 'furniture', (id) =>
    baseObject(id, { gid: firstgid + frame, x: tx * TILE_PX, y: (ty + 1) * TILE_PX, width: tileWidth, height: tileHeight }),
  );
  if (existing) return addCommand;
  const tilesets = [...tilesetRefs, { firstgid, source }].sort((left, right) => left.firstgid - right.firstgid);
  return { kind: 'batch', commands: [{ kind: 'setDocFields', fields: { tilesets } }, addCommand] };
}

/**
 * Bloco de 100 gids na ordem do catálogo, como nos mapas gerados. Num mapa editado no Tiled os
 * firstgid vêm compactados e esse bloco pode cruzar a faixa de outro tileset; aí o novo vai para o
 * primeiro bloco de 100 livre depois de todos.
 */
function freeFirstgid(tilesetRefs: TilesetRef[], tileset: TilesetId): number {
  const tileCountOf = (source: string) => {
    const id = source.replace(/\.tsj$/, '');
    // Tileset fora do catálogo: assume o bloco inteiro de 100.
    return (TILESET_IDS as readonly string[]).includes(id) ? TILESETS[id as TilesetId].tilecount : 100;
  };
  const preferred = 1 + TILESET_IDS.indexOf(tileset) * 100;
  const preferredEnd = preferred + TILESETS[tileset].tilecount;
  // Faixa preferida livre: termina antes de cada tileset existente ou começa depois dele.
  const preferredIsFree = tilesetRefs.every(
    (tilesetRef) => preferredEnd <= tilesetRef.firstgid || tilesetRef.firstgid + tileCountOf(tilesetRef.source) <= preferred,
  );
  if (preferredIsFree) return preferred;
  const highestEnd = Math.max(...tilesetRefs.map((tilesetRef) => tilesetRef.firstgid + tileCountOf(tilesetRef.source)));
  // Arredonda para cima até o próximo início de bloco (1, 101, 201...).
  return Math.ceil((highestEnd - 1) / 100) * 100 + 1;
}

// ---- zonas ----

export interface TileRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Normaliza o retângulo (largura ou altura negativa vira o canto oposto) e recorta ao mapa.
 * Null quando nada sobra dentro do mapa.
 */
function clampRect(doc: TiledDoc, rect: TileRect): TileRect | null {
  const left = Math.max(0, Math.min(rect.x, rect.x + rect.w - 1));
  const top = Math.max(0, Math.min(rect.y, rect.y + rect.h - 1));
  const right = Math.min(doc.width - 1, Math.max(rect.x, rect.x + rect.w - 1));
  const bottom = Math.min(doc.height - 1, Math.max(rect.y, rect.y + rect.h - 1));
  return right >= left && bottom >= top ? { x: left, y: top, w: right - left + 1, h: bottom - top + 1 } : null;
}

/** Zona nova no retângulo (em tiles), com chave `zona-<n>` gerada. */
export function addZone(doc: TiledDoc, rect: TileRect, type: ZoneType, name: string): EditorCommand | null {
  const clamped = clampRect(doc, rect);
  if (!clamped) return null;
  return addWithKey(
    doc,
    'zones',
    (id, key) =>
      baseObject(id, {
        x: clamped.x * TILE_PX,
        y: clamped.y * TILE_PX,
        width: clamped.w * TILE_PX,
        height: clamped.h * TILE_PX,
        properties: [
          { name: 'zone_key', type: 'string', value: key ?? '' },
          { name: 'type', type: 'string', value: type },
          { name: 'name', type: 'string', value: name },
        ],
      }),
    'zone',
  );
}

/** Troca posição e tamanho da zona mantendo a chave; null se o retângulo não mudou. */
export function resizeZone(doc: TiledDoc, id: number, rect: TileRect): EditorCommand | null {
  const clamped = clampRect(doc, rect);
  if (!clamped) return null;
  const zone = findObject(doc, 'zones', id);
  const resized = {
    ...zone,
    x: clamped.x * TILE_PX,
    y: clamped.y * TILE_PX,
    width: clamped.w * TILE_PX,
    height: clamped.h * TILE_PX,
  };
  if (resized.x === zone.x && resized.y === zone.y && resized.width === zone.width && resized.height === zone.height) return null;
  return { kind: 'replaceObject', layer: 'zones', object: resized };
}

/** Muda nome e/ou tipo da zona; só os valores diferentes dos atuais entram no comando. */
export function setZoneProps(doc: TiledDoc, id: number, values: { name?: string; type?: ZoneType }): EditorCommand | null {
  const zone = findObject(doc, 'zones', id);
  const changes = Object.fromEntries(
    Object.entries(values).filter(([name, value]) => prop(zone, name) !== value),
  ) as Record<string, string>;
  if (Object.keys(changes).length === 0) return null;
  return { kind: 'replaceObject', layer: 'zones', object: setProps(zone, changes) };
}

// ---- mesas ----

/** Mesa nova com âncora no tile (tx, ty) e chave `mesa-<n>`; null se não couber no mapa. */
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
  const desk = findObject(doc, 'desks', id);
  const currentOrientation = prop(desk, 'orientation');
  const nextOrientation = CLOCKWISE[(currentOrientation as Dir | undefined) ?? 'down'];
  const deskTiles = Math.max(desk.width, desk.height) > TILE_PX ? 2 : 1;
  const rotated = { ...setProps(desk, { orientation: nextOrientation }), ...deskSize(nextOrientation, deskTiles) };
  // Na borda do mapa, girar a mesa larga poria um tile para fora: não gira.
  if (!fits(doc, rotated.x, rotated.y, rotated.width, rotated.height)) return null;
  return { kind: 'replaceObject', layer: 'desks', object: rotated };
}

// ---- comuns ----

/** Move mantendo a chave (zone_key, desk_key): é por ela que trancas e atribuições acham o objeto. */
export function moveObject(doc: TiledDoc, layer: ObjectLayerName, id: number, tx: number, ty: number): EditorCommand | null {
  const object = findObject(doc, layer, id);
  // Posição em pixels conforme a âncora de cada camada: móvel no canto inferior esquerdo,
  // spawn no centro do tile, zona e mesa no canto superior esquerdo.
  let x = tx * TILE_PX;
  let y = ty * TILE_PX;
  if (layer === 'furniture') y += TILE_PX;
  if (layer === 'spawn') {
    x += TILE_PX / 2;
    y += TILE_PX / 2;
  }
  if (!inside(doc, tx, ty)) return null;
  // Zona, mesa e móvel inteiros têm que caber no mapa depois de mover (o móvel sobe a partir de y).
  const objectWidth = object.width || TILE_PX;
  const objectHeight = object.height || TILE_PX;
  if ((layer === 'zones' || layer === 'desks') && !fits(doc, x, y, objectWidth, objectHeight)) return null;
  if (layer === 'furniture' && !fits(doc, x, y - objectHeight, objectWidth, objectHeight)) return null;
  if (x === object.x && y === object.y) return null;
  return { kind: 'replaceObject', layer, object: { ...object, x, y } };
}

/** Remove o objeto; o id tem que existir (erro em vez de comando vazio). */
export function removeObject(doc: TiledDoc, layer: ObjectLayerName, id: number): EditorCommand {
  findObject(doc, layer, id);
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
  const pixelX = tx * TILE_PX;
  const pixelY = ty * TILE_PX;
  // De trás para frente: o desenhado por último fica por cima e ganha o clique.
  return [...objects].reverse().find((object) => {
    if (layer === 'zones') {
      return pixelX >= object.x && pixelX < object.x + object.width && pixelY >= object.y && pixelY < object.y + object.height;
    }
    // Móvel ancorado no canto inferior esquerdo: a pegada sobe `height` a partir de `y`.
    if (layer === 'furniture') {
      const objectWidth = object.width || TILE_PX;
      const objectHeight = object.height || TILE_PX;
      return pixelX >= object.x && pixelX < object.x + objectWidth && pixelY >= object.y - objectHeight && pixelY < object.y;
    }
    // Mesa ancorada no canto superior esquerdo: a pegada desce `height` a partir de `y`.
    const objectWidth = object.width || TILE_PX;
    const objectHeight = object.height || TILE_PX;
    return pixelX >= object.x && pixelX < object.x + objectWidth && pixelY >= object.y && pixelY < object.y + objectHeight;
  });
}

/**
 * Troca o documento em edição por outro (o modelo) sem reaproveitar chave do mapa atual. Toda
 * chave do documento novo com número já usado no atual (abaixo do contador dele) ganha um número
 * novo: a mesa "mesa-1" do modelo é outra mesa, e a atribuição antiga aparece como órfã ao salvar
 * em vez de ser herdada por uma mesa em outro lugar.
 */
export function adoptDocument(current: TiledDoc, incoming: TiledDoc): TiledDoc {
  // Cópia profunda: o modelo recebido não pode ser alterado.
  const doc = JSON.parse(JSON.stringify(incoming)) as TiledDoc;
  for (const kind of ['zone', 'desk'] as const) {
    const pattern = new RegExp(`^${PREFIX[kind]}-(\\d+)$`);
    // Números abaixo deste já foram usados (ou reservados) no mapa atual.
    const currentNextNumber = nextKeyNumber(current, kind);
    let nextNumber = Math.max(currentNextNumber, nextKeyNumber(doc, kind));
    for (const object of objectLayer(doc, LAYER[kind]).objects) {
      const key = prop(object, KEY_PROP[kind]);
      const match = typeof key === 'string' ? pattern.exec(key) : null;
      if (!match || Number(match[1]) >= currentNextNumber) continue;
      object.properties = withProp(object.properties, KEY_PROP[kind], `${PREFIX[kind]}-${nextNumber}`);
      nextNumber++;
    }
    doc.properties = withProp(doc.properties, COUNTERS[kind], String(nextNumber));
  }
  return doc;
}
