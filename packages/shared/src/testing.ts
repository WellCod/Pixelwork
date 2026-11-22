// Construtor de mapas Tiled para testes. Não entra no bundle do app.
import { TILESET_IDS, type TilesetId } from './catalog.generated.ts';
import { TILE_PX } from './constants.ts';

// 100 gids por tileset, na ordem do catálogo: os tilesets só crescem (docs/art.md), e o firstgid
// contíguo do Tiled faria um tileset que cresceu invadir os gids do seguinte.
export const FIRSTGID = Object.fromEntries(TILESET_IDS.map((id, i) => [id, 1 + i * 100])) as Record<TilesetId, number>;
/** Índices de tile no tileset `furniture` dos placeholders. */
export const FURNITURE = { desk: 0, chair: 1, plant: 2 } as const;

export interface TestMapOptions {
  width?: number;
  height?: number;
  /** Desenha parede em toda a borda. */
  border?: boolean;
  walls?: [x: number, y: number][];
  /** Âncora no tile de baixo à esquerda; `w`/`h` em tiles (padrão 1). */
  furniture?: { x: number; y: number; tile: number; tileset?: TilesetId; w?: number; h?: number }[];
  zones?: { key: string; type: string; name?: string; x: number; y: number; w: number; h: number }[];
  desks?: { key: string; x: number; y: number; orientation: string }[];
  spawns?: [x: number, y: number][];
}

const props = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, type: 'string', value }));

export function buildTestMap(options: TestMapOptions = {}): Record<string, unknown> {
  const width = options.width ?? 10;
  const height = options.height ?? 8;
  const border = options.border ?? true;
  const floor = new Array<number>(width * height).fill(FIRSTGID.floors);
  const walls = new Array<number>(width * height).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      if (border && edge) walls[y * width + x] = FIRSTGID.walls;
    }
  }
  for (const [x, y] of options.walls ?? []) walls[y * width + x] = FIRSTGID.walls;

  let nextId = 1;
  const object = (extra: Record<string, unknown>) => ({
    id: nextId++,
    name: '',
    type: '',
    rotation: 0,
    visible: true,
    width: 0,
    height: 0,
    ...extra,
  });

  return {
    type: 'map',
    version: '1.10',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width,
    height,
    tilewidth: TILE_PX,
    tileheight: TILE_PX,
    tilesets: Object.entries(FIRSTGID).map(([id, firstgid]) => ({ firstgid, source: `${id}.tsj` })),
    layers: [
      { id: 1, name: 'floor', type: 'tilelayer', width, height, x: 0, y: 0, data: floor },
      { id: 2, name: 'walls', type: 'tilelayer', width, height, x: 0, y: 0, data: walls },
      {
        id: 3,
        name: 'furniture',
        type: 'objectgroup',
        objects: (options.furniture ?? []).map((f) =>
          object({
            gid: FIRSTGID[f.tileset ?? 'furniture'] + f.tile,
            x: f.x * TILE_PX,
            y: (f.y + 1) * TILE_PX,
            width: (f.w ?? 1) * TILE_PX,
            height: (f.h ?? 1) * TILE_PX,
          }),
        ),
      },
      {
        id: 4,
        name: 'zones',
        type: 'objectgroup',
        objects: (options.zones ?? []).map((z) =>
          object({
            x: z.x * TILE_PX,
            y: z.y * TILE_PX,
            width: z.w * TILE_PX,
            height: z.h * TILE_PX,
            properties: props({ zone_key: z.key, type: z.type, name: z.name ?? z.key }),
          }),
        ),
      },
      {
        id: 5,
        name: 'desks',
        type: 'objectgroup',
        objects: (options.desks ?? []).map((d) =>
          object({
            x: d.x * TILE_PX,
            y: d.y * TILE_PX,
            width: TILE_PX,
            height: TILE_PX,
            properties: props({ desk_key: d.key, orientation: d.orientation }),
          }),
        ),
      },
      {
        id: 6,
        name: 'spawn',
        type: 'objectgroup',
        objects: (options.spawns ?? [[1, 1]]).map(([x, y]) =>
          object({ x: x * TILE_PX + TILE_PX / 2, y: y * TILE_PX + TILE_PX / 2, point: true }),
        ),
      },
    ],
  };
}
