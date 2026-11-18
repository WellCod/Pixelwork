import { TILESETS, TILESET_IDS, type TilesetId } from './catalog.generated.ts';
import { TILE_PX } from './constants.ts';
import { DIR_DELTA, DIRS, type Dir } from './protocol.ts';

export const MAX_MAP_TILES = 100;
export const OPEN_ZONE_KEY = '__open';
const KEY = /^[a-z0-9-]{1,40}$/;
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
  x: number;
  y: number;
  orientation: Dir;
  chairX: number;
  chairY: number;
}

export interface CompiledMap {
  width: number;
  height: number;
  /** 1 = caminhável, índice y * width + x. */
  walkable: Uint8Array;
  /** Índice em `zones` para cada tile; 0 é a zona implícita `__open`. */
  zoneIndex: Uint16Array;
  zones: CompiledZone[];
  desks: CompiledDesk[];
  spawn: { x: number; y: number };
  tilesets: TilesetId[];
}

export type MapError =
  | { code: 'not_orthogonal' | 'infinite' | 'wrong_tile_size' | 'too_large' | 'compressed_layer' }
  | { code: 'missing_layer' | 'wrong_layer_type'; layer: string }
  | { code: 'unknown_tileset'; source: string }
  | { code: 'tileset_overlap'; a: string; b: string }
  | { code: 'duplicate_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'invalid_key'; kind: 'zone' | 'desk'; key: string }
  | { code: 'zone_overlap'; a: string; b: string }
  | { code: 'zone_not_aligned' | 'invalid_zone_type'; key: string }
  | { code: 'chair_blocked' | 'invalid_orientation'; deskKey: string }
  | { code: 'spawn_count'; found: number }
  | { code: 'spawn_blocked' };

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

function property(object: Json, name: string): unknown {
  const props = object.properties;
  if (!Array.isArray(props)) return undefined;
  for (const prop of props) {
    if (isObject(prop) && prop.name === name) return prop.value;
  }
  return undefined;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function objectsOf(layer: Json): Json[] {
  return Array.isArray(layer.objects) ? layer.objects.filter(isObject) : [];
}

/** Resolve um gid do mapa para o tileset do catálogo e o índice local do tile. */
function resolveGid(gid: number, refs: readonly TilesetRef[]): { id: TilesetId; tile: number } | null {
  const clean = gid & GID_MASK;
  if (clean === 0) return null;
  let found: TilesetRef | null = null;
  for (const ref of refs) {
    if (ref.firstgid <= clean && (!found || ref.firstgid > found.firstgid)) found = ref;
  }
  if (!found) return null;
  const tile = clean - found.firstgid;
  return tile < TILESETS[found.id].tilecount ? { id: found.id, tile } : null;
}

export function compileMap(json: unknown): CompileResult {
  // Sem objeto não há `orientation`, então o mapa não é ortogonal.
  if (!isObject(json)) return { ok: false, errors: [{ code: 'not_orthogonal' }] };

  const errors: MapError[] = [];
  if (json.orientation !== 'orthogonal') errors.push({ code: 'not_orthogonal' });
  if (json.infinite === true) errors.push({ code: 'infinite' });
  if (json.tilewidth !== TILE_PX || json.tileheight !== TILE_PX) errors.push({ code: 'wrong_tile_size' });

  const width = num(json.width);
  const height = num(json.height);
  const sizeOk =
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= MAX_MAP_TILES &&
    height <= MAX_MAP_TILES;
  if (!sizeOk) errors.push({ code: 'too_large' });

  const layers = Array.isArray(json.layers) ? json.layers.filter(isObject) : [];
  const layer = (name: string) => layers.find((l) => l.name === name);

  for (const name of TILE_LAYERS) {
    const l = layer(name);
    if (!l) errors.push({ code: 'missing_layer', layer: name });
    else if (l.type !== 'tilelayer') errors.push({ code: 'wrong_layer_type', layer: name });
    else if (l.encoding !== undefined || l.compression !== undefined || !Array.isArray(l.data)) {
      errors.push({ code: 'compressed_layer' });
    }
  }
  for (const name of OBJECT_LAYERS) {
    const l = layer(name);
    if (!l) errors.push({ code: 'missing_layer', layer: name });
    else if (l.type !== 'objectgroup') errors.push({ code: 'wrong_layer_type', layer: name });
  }

  const refs: TilesetRef[] = [];
  const tilesetList = Array.isArray(json.tilesets) ? json.tilesets : [];
  for (const raw of tilesetList) {
    const source = isObject(raw) && typeof raw.source === 'string' ? raw.source : '';
    const id = source.endsWith('.tsj') ? source.slice(0, -4) : '';
    const known = (TILESET_IDS as readonly string[]).includes(id);
    const firstgid = isObject(raw) ? num(raw.firstgid) : NaN;
    if (!known || !Number.isInteger(firstgid) || firstgid < 1) {
      errors.push({ code: 'unknown_tileset', source: source || '(embutido)' });
    } else {
      refs.push({ firstgid, id: id as TilesetId });
    }
  }

  // Um tileset que cresceu depois de o mapa ser salvo invade os gids do seguinte.
  const sorted = [...refs].sort((a, b) => a.firstgid - b.firstgid);
  sorted.forEach((ref, i) => {
    const next = sorted[i + 1];
    if (next && ref.firstgid + TILESETS[ref.id].tilecount > next.firstgid) {
      errors.push({ code: 'tileset_overlap', a: ref.id, b: next.id });
    }
  });

  // Sem estrutura válida não dá para seguir para a geometria.
  if (errors.length > 0) return { ok: false, errors };

  const size = width * height;
  const tileData = (name: string): unknown[] => (layer(name)?.data as unknown[] | undefined) ?? [];
  const floor = tileData('floor');
  const walls = tileData('walls');

  const walkable = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const hasFloor = (num(floor[i]) & GID_MASK) > 0;
    const hasWall = (num(walls[i]) & GID_MASK) > 0;
    walkable[i] = hasFloor && !hasWall ? 1 : 0;
  }
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const block = (x: number, y: number) => {
    if (inside(x, y)) walkable[y * width + x] = 0;
  };
  const isWalkable = (x: number, y: number) => inside(x, y) && walkable[y * width + x] === 1;

  // Objetos de tile do Tiled ficam ancorados no canto inferior esquerdo.
  for (const object of objectsOf(layer('furniture') as Json)) {
    const resolved = resolveGid(num(object.gid), refs);
    if (!resolved || !TILESETS[resolved.id].collides.includes(resolved.tile)) continue;
    const x0 = Math.floor(num(object.x) / TILE_PX);
    const y1 = Math.ceil(num(object.y) / TILE_PX);
    const w = Math.max(1, Math.round(num(object.width) / TILE_PX) || 1);
    const h = Math.max(1, Math.round(num(object.height) / TILE_PX) || 1);
    for (let y = y1 - h; y < y1; y++) for (let x = x0; x < x0 + w; x++) block(x, y);
  }

  const zones: CompiledZone[] = [{ key: OPEN_ZONE_KEY, type: 'open', name: '', tiles: 0 }];
  const zoneIndex = new Uint16Array(size);
  const zoneKeys = new Set<string>();
  const overlaps = new Set<string>();
  for (const object of objectsOf(layer('zones') as Json)) {
    const rawKey = property(object, 'zone_key');
    const key = typeof rawKey === 'string' ? rawKey : '';
    if (!KEY.test(key)) {
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
    const [x, y, w, h] = [object.x, object.y, object.width, object.height].map(num) as [
      number,
      number,
      number,
      number,
    ];
    const aligned = [x, y, w, h].every((v) => Number.isInteger(v / TILE_PX)) && w > 0 && h > 0;
    if (!aligned) {
      errors.push({ code: 'zone_not_aligned', key });
      continue;
    }
    const nameProp = property(object, 'name');
    const zone: CompiledZone = {
      key,
      type,
      name: typeof nameProp === 'string' ? nameProp : key,
      tiles: 0,
    };
    zones.push(zone);
    const index = zones.length - 1;
    for (let ty = y / TILE_PX; ty < (y + h) / TILE_PX; ty++) {
      for (let tx = x / TILE_PX; tx < (x + w) / TILE_PX; tx++) {
        if (!inside(tx, ty)) continue;
        const i = ty * width + tx;
        const current = zoneIndex[i] ?? 0;
        if (current !== 0) {
          const other = zones[current]?.key ?? '';
          const pair = [other, key].sort().join('\0');
          if (!overlaps.has(pair)) {
            overlaps.add(pair);
            errors.push({ code: 'zone_overlap', a: other, b: key });
          }
          continue;
        }
        zoneIndex[i] = index;
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
  for (const object of objectsOf(layer('desks') as Json)) {
    const rawKey = property(object, 'desk_key');
    const key = typeof rawKey === 'string' ? rawKey : '';
    if (!KEY.test(key)) {
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
    const x = Math.floor(num(object.x) / TILE_PX);
    const y = Math.floor(num(object.y) / TILE_PX);
    const [dx, dy] = DIR_DELTA[dir];
    desks.push({ key, x, y, orientation: dir, chairX: x + dx, chairY: y + dy });
    block(x, y);
  }
  for (const desk of desks) {
    if (!isWalkable(desk.chairX, desk.chairY)) errors.push({ code: 'chair_blocked', deskKey: desk.key });
  }

  const spawns = objectsOf(layer('spawn') as Json);
  let spawn = { x: 0, y: 0 };
  if (spawns.length !== 1) {
    errors.push({ code: 'spawn_count', found: spawns.length });
  } else if (spawns[0]) {
    spawn = {
      x: Math.floor(num(spawns[0].x) / TILE_PX),
      y: Math.floor(num(spawns[0].y) / TILE_PX),
    };
    if (!isWalkable(spawn.x, spawn.y)) errors.push({ code: 'spawn_blocked' });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    map: {
      width,
      height,
      walkable,
      zoneIndex,
      zones,
      desks,
      spawn,
      tilesets: [...new Set(refs.map((r) => r.id))],
    },
  };
}

export function isWalkable(map: CompiledMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height && map.walkable[y * map.width + x] === 1;
}

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
  const zone = zoneAt(map, x, y).key;
  const inside = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  const start = { x: Math.min(Math.max(x, 0), map.width - 1), y: Math.min(Math.max(y, 0), map.height - 1) };
  const seen = new Uint8Array(map.width * map.height);
  const queue: { x: number; y: number }[] = [start];
  seen[start.y * map.width + start.x] = 1;
  for (let head = 0; head < queue.length; head++) {
    const tile = queue[head];
    if (!tile) break;
    if (isWalkable(map, tile.x, tile.y) && zoneAt(map, tile.x, tile.y).key === zone) return tile;
    for (const [dx, dy] of Object.values(DIR_DELTA)) {
      const nx = tile.x + dx;
      const ny = tile.y + dy;
      if (!inside(nx, ny) || seen[ny * map.width + nx]) continue;
      seen[ny * map.width + nx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  return { ...map.spawn };
}
