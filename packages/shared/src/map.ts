import { TILESETS, TILESET_IDS, type TilesetId } from './catalog.generated.ts';
import { TILE_PX } from './constants.ts';
import { DIR_DELTA, DIRS, type Dir } from './protocol.ts';
import { INTERACTIVE_ITEMS, type CompiledTable } from './tables.ts';

/** Lado máximo do mapa em tiles (100x100). */
export const MAX_MAP_TILES = 100;
/** Chave da zona implícita: todo tile fora de uma zona desenhada pertence a ela. */
export const OPEN_ZONE_KEY = '__open';
/** Formato aceito para `zone_key` e `desk_key`. */
const KEY_PATTERN = /^[a-z0-9-]{1,40}$/;
// Bits de espelhamento e rotação que o Tiled guarda no topo do gid.
const GID_MASK = 0x0fffffff;

export type ZoneType = 'open' | 'meeting';

export interface CompiledZone {
  key: string;
  type: ZoneType;
  name: string;
  tiles: number;
}

export interface CompiledDesk {
  key: string;
  /** Tile de âncora: o de cima à esquerda da pegada. */
  x: number;
  y: number;
  /** Pegada em tiles: 1x1, 2x1 (de frente para cima ou baixo) ou 1x2 (para os lados). */
  w: number;
  h: number;
  orientation: Dir;
  chairX: number;
  chairY: number;
  /**
   * A borda de trás da mesa (o lado oposto à cadeira) encosta inteira em parede. O cliente usa
   * para pendurar a decoração de parede nela, ou numa divisória quando não há parede.
   */
  wallBehind: boolean;
}

/** Mapa validado e reduzido ao que a simulação e o cliente consultam (grade, zonas, mesas). */
export interface CompiledMap {
  width: number;
  height: number;
  /** 1 = caminhável, índice y * width + x. */
  walkable: Uint8Array;
  /** Índice em `zones` para cada tile; 0 é a zona implícita `__open`. */
  zoneIndex: Uint16Array;
  zones: CompiledZone[];
  desks: CompiledDesk[];
  /** Móveis com interação (mesa de pingpong), na ordem da camada `furniture`. */
  tables: CompiledTable[];
  spawn: { x: number; y: number };
  tilesets: TilesetId[];
}

export type MapError =
  | { code: 'not_orthogonal' | 'infinite' | 'wrong_tile_size' | 'too_large' | 'compressed_layer' }
  | { code: 'missing_layer' | 'wrong_layer_type' | 'layer_size'; layer: string }
  | { code: 'unknown_tileset'; source: string }
  | { code: 'tileset_overlap'; a: string; b: string }
  | { code: 'duplicate_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'invalid_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'zone_overlap'; a: string; b: string }
  | { code: 'zone_not_aligned' | 'invalid_zone_type' | 'zone_outside'; key: string }
  | { code: 'chair_blocked' | 'invalid_orientation' | 'desk_outside' | 'desk_size'; deskKey: string }
  | { code: 'chair_shared'; a: string; b: string }
  | { code: 'spawn_count'; found: number }
  | { code: 'furniture_position'; objectId: number }
  | { code: 'spawn_blocked' | 'spawn_in_meeting' };

export type CompileResult = { ok: true; map: CompiledMap } | { ok: false; errors: MapError[] };

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const TILE_LAYERS = ['floor', 'walls'] as const;
const OBJECT_LAYERS = ['furniture', 'zones', 'desks', 'spawn'] as const;

interface TilesetRef {
  firstgid: number;
  id: TilesetId;
}

/** Valor da propriedade `name` de um objeto do Tiled (lista `properties`), ou undefined. */
function property(object: Json, name: string): unknown {
  const properties = object.properties;
  if (!Array.isArray(properties)) return undefined;
  for (const entry of properties) {
    if (isObject(entry) && entry.name === name) return entry.value;
  }
  return undefined;
}

/** Número finito ou NaN: com NaN as comparações falham e o valor inválido vira erro de validação. */
function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function objectsOf(layer: Json): Json[] {
  return Array.isArray(layer.objects) ? layer.objects.filter(isObject) : [];
}

/** Resolve um gid do mapa para o tileset do catálogo e o índice local do tile. */
function resolveGid(gid: number, tilesetRefs: readonly TilesetRef[]): { id: TilesetId; tile: number } | null {
  const bareGid = gid & GID_MASK;
  if (bareGid === 0) return null;
  // Dono do gid: o tileset de maior firstgid que ainda não passa dele (regra do Tiled).
  let owner: TilesetRef | null = null;
  for (const tilesetRef of tilesetRefs) {
    if (tilesetRef.firstgid <= bareGid && (!owner || tilesetRef.firstgid > owner.firstgid)) owner = tilesetRef;
  }
  if (!owner) return null;
  const tile = bareGid - owner.firstgid;
  return tile < TILESETS[owner.id].tilecount ? { id: owner.id, tile } : null;
}

/**
 * Valida o JSON do Tiled e compila o mapa (docs/architecture.md, seção 6). Primeiro confere a
 * estrutura (orientação, tamanho, camadas, tilesets); com ela válida, monta a grade caminhável,
 * as zonas, as mesas e o spawn, juntando todos os erros em vez de parar no primeiro.
 */
export function compileMap(json: unknown): CompileResult {
  // Sem objeto não há `orientation`, então o mapa não é ortogonal.
  if (!isObject(json)) return { ok: false, errors: [{ code: 'not_orthogonal' }] };

  const errors: MapError[] = [];
  if (json.orientation !== 'orthogonal') errors.push({ code: 'not_orthogonal' });
  if (json.infinite === true) errors.push({ code: 'infinite' });
  if (json.tilewidth !== TILE_PX || json.tileheight !== TILE_PX) errors.push({ code: 'wrong_tile_size' });

  const width = asNumber(json.width);
  const height = asNumber(json.height);
  const sizeOk =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= MAX_MAP_TILES &&
    height <= MAX_MAP_TILES;
  if (!sizeOk) errors.push({ code: 'too_large' });

  const layers = Array.isArray(json.layers) ? json.layers.filter(isObject) : [];
  const findLayer = (name: string) => layers.find((layer) => layer.name === name);

  for (const name of TILE_LAYERS) {
    const layer = findLayer(name);
    if (!layer) errors.push({ code: 'missing_layer', layer: name });
    else if (layer.type !== 'tilelayer') errors.push({ code: 'wrong_layer_type', layer: name });
    else if (layer.encoding !== undefined || layer.compression !== undefined || !Array.isArray(layer.data)) {
      errors.push({ code: 'compressed_layer' });
    }
  }
  for (const name of OBJECT_LAYERS) {
    const layer = findLayer(name);
    if (!layer) errors.push({ code: 'missing_layer', layer: name });
    else if (layer.type !== 'objectgroup') errors.push({ code: 'wrong_layer_type', layer: name });
  }

  // Só tilesets externos do catálogo (`<id>.tsj`); tileset embutido no mapa é recusado.
  const tilesetRefs: TilesetRef[] = [];
  const tilesetList = Array.isArray(json.tilesets) ? json.tilesets : [];
  for (const rawTileset of tilesetList) {
    const source = isObject(rawTileset) && typeof rawTileset.source === 'string' ? rawTileset.source : '';
    const id = source.endsWith('.tsj') ? source.slice(0, -4) : '';
    const known = (TILESET_IDS as readonly string[]).includes(id);
    const firstgid = isObject(rawTileset) ? asNumber(rawTileset.firstgid) : NaN;
    if (!known || !Number.isInteger(firstgid) || firstgid < 1) {
      errors.push({ code: 'unknown_tileset', source: source || '(embutido)' });
    } else {
      tilesetRefs.push({ firstgid, id: id as TilesetId });
    }
  }

  // Um tileset que cresceu depois de o mapa ser salvo invade os gids do seguinte.
  const refsByFirstgid = [...tilesetRefs].sort((left, right) => left.firstgid - right.firstgid);
  refsByFirstgid.forEach((tilesetRef, i) => {
    const nextRef = refsByFirstgid[i + 1];
    if (nextRef && tilesetRef.firstgid + TILESETS[tilesetRef.id].tilecount > nextRef.firstgid) {
      errors.push({ code: 'tileset_overlap', a: tilesetRef.id, b: nextRef.id });
    }
  });

  // Sem estrutura válida não dá para seguir para a geometria.
  if (errors.length > 0) return { ok: false, errors };

  const tileCount = width * height;
  const tileData = (name: string): unknown[] => (findLayer(name)?.data as unknown[] | undefined) ?? [];
  const floor = tileData('floor');
  const walls = tileData('walls');
  // Camada com outro tamanho compila, mas o Phaser desenharia deslocado ou vazio.
  for (const name of TILE_LAYERS) {
    if (tileData(name).length !== tileCount) errors.push({ code: 'layer_size', layer: name });
  }

  // Caminhável = tem piso e não tem parede; móveis e mesas bloqueiam depois.
  const walkable = new Uint8Array(tileCount);
  for (let i = 0; i < tileCount; i++) {
    const hasFloor = (asNumber(floor[i]) & GID_MASK) > 0;
    const hasWall = (asNumber(walls[i]) & GID_MASK) > 0;
    walkable[i] = hasFloor && !hasWall ? 1 : 0;
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const block = (x: number, y: number) => {
    if (inside(x, y)) walkable[y * width + x] = 0;
  };
  const walkableAt = (x: number, y: number) => inside(x, y) && walkable[y * width + x] === 1;

  // Objetos de tile do Tiled ficam ancorados no canto inferior esquerdo.
  const interactiveTables: Omit<CompiledTable, 'sides'>[] = [];
  for (const object of objectsOf(findLayer('furniture') as Json)) {
    const resolved = resolveGid(asNumber(object.gid), tilesetRefs);
    if (!resolved) continue;
    // Sem posição numérica a pegada vira NaN: não bloqueia nada e a chave da mesa sai "@NaN,NaN".
    if (!Number.isFinite(asNumber(object.x)) || !Number.isFinite(asNumber(object.y))) {
      errors.push({ code: 'furniture_position', objectId: asNumber(object.id) });
      continue;
    }
    const left = Math.floor(asNumber(object.x) / TILE_PX);
    // Linha logo abaixo da pegada (exclusiva): a pegada ocupa de `bottom - footprintHeight` até `bottom - 1`.
    const bottom = Math.ceil(asNumber(object.y) / TILE_PX);
    const footprintWidth = Math.max(1, Math.round(asNumber(object.width) / TILE_PX) || 1);
    const footprintHeight = Math.max(1, Math.round(asNumber(object.height) / TILE_PX) || 1);
    const item = TILESETS[resolved.id].items[resolved.tile];
    const game = item === undefined ? undefined : INTERACTIVE_ITEMS[item];
    if (item !== undefined && game !== undefined) {
      interactiveTables.push({
        key: `${item}@${left},${bottom - footprintHeight}`,
        game,
        x: left,
        y: bottom - footprintHeight,
        w: footprintWidth,
        h: footprintHeight,
      });
    }
    if (!TILESETS[resolved.id].collides.includes(resolved.tile)) continue;
    // Recortado ao mapa: um objeto com tamanho absurdo num JSON pequeno travaria o servidor.
    for (let y = Math.max(0, bottom - footprintHeight); y < Math.min(height, bottom); y++) {
      for (let x = Math.max(0, left); x < Math.min(width, left + footprintWidth); x++) block(x, y);
    }
  }

  const zones: CompiledZone[] = [{ key: OPEN_ZONE_KEY, type: 'open', name: '', tiles: 0 }];
  const zoneIndex = new Uint16Array(tileCount);
  const zoneKeys = new Set<string>();
  /** Pares de zonas já reportados como sobrepostos, para um erro só por par. */
  const reportedOverlaps = new Set<string>();
  for (const object of objectsOf(findLayer('zones') as Json)) {
    const rawKey = property(object, 'zone_key');
    const key = typeof rawKey === 'string' ? rawKey : '';
    if (!KEY_PATTERN.test(key)) {
      errors.push({ code: 'invalid_key', kind: 'zone', key });
      continue;
    }
    if (zoneKeys.has(key)) {
      errors.push({ code: 'duplicate_key', kind: 'zone', key });
      continue;
    }
    zoneKeys.add(key);
    const type = property(object, 'type');
    if (type !== 'open' && type !== 'meeting') {
      errors.push({ code: 'invalid_zone_type', key });
      continue;
    }
    const [pixelX, pixelY, pixelWidth, pixelHeight] = [object.x, object.y, object.width, object.height].map(asNumber) as [
      number,
      number,
      number,
      number,
    ];
    // Zona tem que cair na grade: posição e tamanho múltiplos de TILE_PX, e área positiva.
    const aligned =
      [pixelX, pixelY, pixelWidth, pixelHeight].every((value) => Number.isInteger(value / TILE_PX)) &&
      pixelWidth > 0 &&
      pixelHeight > 0;
    if (!aligned) {
      errors.push({ code: 'zone_not_aligned', key });
      continue;
    }
    const nameProperty = property(object, 'name');
    const zone: CompiledZone = {
      key,
      type,
      name: typeof nameProperty === 'string' ? nameProperty : key,
      tiles: 0,
    };
    // Retângulo em tiles recortado ao mapa; os limites `end` são exclusivos.
    const firstRow = Math.max(0, pixelY / TILE_PX);
    const endRow = Math.min(height, (pixelY + pixelHeight) / TILE_PX);
    const firstColumn = Math.max(0, pixelX / TILE_PX);
    const endColumn = Math.min(width, (pixelX + pixelWidth) / TILE_PX);
    // Zona sem nenhum tile dentro do mapa criaria tranca e sala de mídia que ninguém alcança.
    if (endColumn <= firstColumn || endRow <= firstRow) {
      errors.push({ code: 'zone_outside', key });
      continue;
    }
    zones.push(zone);
    const zoneNumber = zones.length - 1;
    for (let ty = firstRow; ty < endRow; ty++) {
      for (let tx = firstColumn; tx < endColumn; tx++) {
        const tileIndex = ty * width + tx;
        const existingZone = zoneIndex[tileIndex] ?? 0;
        if (existingZone !== 0) {
          // Tile já é de outra zona: a primeira desenhada fica com ele.
          const otherKey = zones[existingZone]?.key ?? '';
          const pairKey = [otherKey, key].sort().join('\0');
          if (!reportedOverlaps.has(pairKey)) {
            reportedOverlaps.add(pairKey);
            errors.push({ code: 'zone_overlap', a: otherKey, b: key });
          }
          continue;
        }
        zoneIndex[tileIndex] = zoneNumber;
      }
    }
  }
  for (const i of zoneIndex.keys()) {
    const zone = zones[zoneIndex[i] ?? 0];
    if (zone) zone.tiles++;
  }

  // Duas passadas: toda mesa bloqueia o próprio tile antes de conferir as cadeiras.
  const desks: CompiledDesk[] = [];
  const deskKeys = new Set<string>();
  for (const object of objectsOf(findLayer('desks') as Json)) {
    const rawKey = property(object, 'desk_key');
    const key = typeof rawKey === 'string' ? rawKey : '';
    if (!KEY_PATTERN.test(key)) {
      errors.push({ code: 'invalid_key', kind: 'desk', key });
      continue;
    }
    if (deskKeys.has(key)) {
      errors.push({ code: 'duplicate_key', kind: 'desk', key });
      continue;
    }
    deskKeys.add(key);
    const orientation = property(object, 'orientation');
    if (!(DIRS as readonly unknown[]).includes(orientation)) {
      errors.push({ code: 'invalid_orientation', deskKey: key });
      continue;
    }
    const dir = orientation as Dir;
    const x = Math.floor(asNumber(object.x) / TILE_PX);
    const y = Math.floor(asNumber(object.y) / TILE_PX);
    if (!inside(x, y)) {
      errors.push({ code: 'desk_outside', deskKey: key });
      continue;
    }
    // Pegada pelo tamanho do objeto no Tiled: 16x16 é a mesa de 1 tile dos mapas antigos.
    const footprintWidth = Math.max(1, Math.round(asNumber(object.width) / TILE_PX) || 1);
    const footprintHeight = Math.max(1, Math.round(asNumber(object.height) / TILE_PX) || 1);
    const facesUpDown = dir === 'up' || dir === 'down';
    // Mesa larga fica de lado para a cadeira: 2x1 virada para cima/baixo, 1x2 para os lados.
    const sizeOk =
      (footprintWidth === 1 && footprintHeight === 1) ||
      (footprintWidth === 2 && footprintHeight === 1 && facesUpDown) ||
      (footprintWidth === 1 && footprintHeight === 2 && !facesUpDown);
    if (!sizeOk) {
      errors.push({ code: 'desk_size', deskKey: key });
      continue;
    }
    if (!inside(x + footprintWidth - 1, y + footprintHeight - 1)) {
      errors.push({ code: 'desk_outside', deskKey: key });
      continue;
    }
    // Cadeira na frente do tile de âncora, encostada na borda da pegada.
    const chairTile = {
      down: [x, y + footprintHeight],
      up: [x, y - 1],
      left: [x - 1, y],
      right: [x + footprintWidth, y],
    }[dir];
    // Tiles logo atrás da pegada, do lado oposto à cadeira.
    const backTiles: [number, number][] = facesUpDown
      ? Array.from({ length: footprintWidth }, (_, i) => [x + i, dir === 'down' ? y - 1 : y + footprintHeight])
      : Array.from({ length: footprintHeight }, (_, i) => [dir === 'left' ? x + footprintWidth : x - 1, y + i]);
    const wallBehind = backTiles.every(
      ([backX, backY]) => inside(backX, backY) && (asNumber(walls[backY * width + backX]) & GID_MASK) > 0,
    );
    desks.push({
      key,
      x,
      y,
      w: footprintWidth,
      h: footprintHeight,
      orientation: dir,
      chairX: chairTile[0] ?? x,
      chairY: chairTile[1] ?? y,
      wallBehind,
    });
    for (let ty = y; ty < y + footprintHeight; ty++) for (let tx = x; tx < x + footprintWidth; tx++) block(tx, ty);
  }
  /** Tile da cadeira (índice na grade) -> chave da primeira mesa que usa essa cadeira. */
  const chairOwners = new Map<number, string>();
  for (const desk of desks) {
    if (!walkableAt(desk.chairX, desk.chairY)) errors.push({ code: 'chair_blocked', deskKey: desk.key });
    // Duas mesas com a mesma cadeira: sentar ali contaria como estar nas duas.
    const chairIndex = desk.chairY * width + desk.chairX;
    const otherDeskKey = chairOwners.get(chairIndex);
    if (otherDeskKey !== undefined) errors.push({ code: 'chair_shared', a: otherDeskKey, b: desk.key });
    else chairOwners.set(chairIndex, desk.key);
  }

  const spawns = objectsOf(findLayer('spawn') as Json);
  let spawn = { x: 0, y: 0 };
  if (spawns.length !== 1) {
    errors.push({ code: 'spawn_count', found: spawns.length });
  } else if (spawns[0]) {
    spawn = {
      x: Math.floor(asNumber(spawns[0].x) / TILE_PX),
      y: Math.floor(asNumber(spawns[0].y) / TILE_PX),
    };
    if (!walkableAt(spawn.x, spawn.y)) errors.push({ code: 'spawn_blocked' });
    // Quem entra nasceria dentro da sala e furaria a tranca.
    else if (zones[zoneIndex[spawn.y * width + spawn.x] ?? 0]?.type === 'meeting') {
      errors.push({ code: 'spawn_in_meeting' });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  // Lados calculados depois de tudo bloquear (móveis e mesas): só tiles onde dá para ficar.
  const walkableColumn = (columnX: number, table: Omit<CompiledTable, 'sides'>) =>
    Array.from({ length: table.h }, (_, i): [number, number] => [columnX, table.y + i]).filter(([cellX, cellY]) =>
      walkableAt(cellX, cellY),
    );
  const tables: CompiledTable[] = interactiveTables.map((table) => ({
    ...table,
    sides: { left: walkableColumn(table.x - 1, table), right: walkableColumn(table.x + table.w, table) },
  }));
  return {
    ok: true,
    map: {
      width,
      height,
      walkable,
      zoneIndex,
      zones,
      desks,
      tables,
      spawn,
      tilesets: [...new Set(tilesetRefs.map((tilesetRef) => tilesetRef.id))],
    },
  };
}

/** Tile dentro do mapa e caminhável; fora do mapa conta como bloqueado. */
export function isWalkable(map: CompiledMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && map.walkable[y * map.width + x] === 1;
}

/** Zona do tile; fora do mapa, a zona implícita `__open`. */
export function zoneAt(map: CompiledMap, x: number, y: number): CompiledZone {
  const index = x >= 0 && y >= 0 && x < map.width && y < map.height ? map.zoneIndex[y * map.width + x] : 0;
  const zone = map.zones[index ?? 0] ?? map.zones[0];
  if (!zone) throw new Error('mapa compilado sem zona implícita');
  return zone;
}

/**
 * Para onde vai quem ficou num tile não caminhável depois de trocar o mapa: o tile caminhável
 * mais próximo (busca em largura, 4 vizinhos) na mesma zona; sem nenhum na zona, o spawn.
 */
export function relocate(map: CompiledMap, x: number, y: number): { x: number; y: number } {
  if (isWalkable(map, x, y)) return { x, y };
  const zoneKey = zoneAt(map, x, y).key;
  const inside = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  // Posição fora do mapa (mapa novo menor) começa a busca da borda mais próxima.
  const start = { x: Math.min(Math.max(x, 0), map.width - 1), y: Math.min(Math.max(y, 0), map.height - 1) };
  const seen = new Uint8Array(map.width * map.height);
  const queue: { x: number; y: number }[] = [start];
  seen[start.y * map.width + start.x] = 1;
  // A fila cresce durante o laço; `head` anda por ela sem `shift`, que seria O(n) por item.
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head];
    if (!tile) break;
    if (isWalkable(map, tile.x, tile.y) && zoneAt(map, tile.x, tile.y).key === zoneKey) return tile;
    for (const [dx, dy] of Object.values(DIR_DELTA)) {
      const neighborX = tile.x + dx;
      const neighborY = tile.y + dy;
      if (!inside(neighborX, neighborY) || seen[neighborY * map.width + neighborX]) continue;
      seen[neighborY * map.width + neighborX] = 1;
      queue.push({ x: neighborX, y: neighborY });
    }
  }
  return { ...map.spawn };
}
