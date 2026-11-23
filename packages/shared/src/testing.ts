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
  /** `size: 2` é a mesa larga: 32x16 virada para cima/baixo, 16x32 para os lados. */
  desks?: { key: string; x: number; y: number; orientation: string; size?: 1 | 2 }[];
  spawns?: [x: number, y: number][];
}

/** Propriedades no formato do Tiled (lista de `{ name, type, value }`), todas string. */
const props = (values: Record<string, string>) =>
  Object.entries(values).map(([name, value]) => ({ name, type: 'string', value }));

/**
 * JSON de mapa Tiled no formato que o `compileMap` aceita, com piso em tudo, parede na borda e
 * os objetos pedidos. Coordenadas das opções em tiles; aqui viram pixels como no Tiled.
 */
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
  /** Objeto do Tiled com os campos obrigatórios e id sequencial, mais o que vier em `extra`. */
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
        // Objeto de tile do Tiled fica ancorado no canto inferior esquerdo, daí o `y + 1`.
        objects: (options.furniture ?? []).map((furniture) =>
          object({
            gid: FIRSTGID[furniture.tileset ?? 'furniture'] + furniture.tile,
            x: furniture.x * TILE_PX,
            y: (furniture.y + 1) * TILE_PX,
            width: (furniture.w ?? 1) * TILE_PX,
            height: (furniture.h ?? 1) * TILE_PX,
          }),
        ),
      },
      {
        id: 4,
        name: 'zones',
        type: 'objectgroup',
        objects: (options.zones ?? []).map((zone) =>
          object({
            x: zone.x * TILE_PX,
            y: zone.y * TILE_PX,
            width: zone.w * TILE_PX,
            height: zone.h * TILE_PX,
            properties: props({ zone_key: zone.key, type: zone.type, name: zone.name ?? zone.key }),
          }),
        ),
      },
      {
        id: 5,
        name: 'desks',
        type: 'objectgroup',
        objects: (options.desks ?? []).map((desk) => {
          const wide = desk.size === 2;
          const vertical = desk.orientation === 'left' || desk.orientation === 'right';
          return object({
            x: desk.x * TILE_PX,
            y: desk.y * TILE_PX,
            width: wide && !vertical ? 2 * TILE_PX : TILE_PX,
            height: wide && vertical ? 2 * TILE_PX : TILE_PX,
            properties: props({ desk_key: desk.key, orientation: desk.orientation }),
          });
        }),
      },
      {
        id: 6,
        name: 'spawn',
        type: 'objectgroup',
        // Spawn é um ponto no centro do tile.
        objects: (options.spawns ?? [[1, 1]]).map(([x, y]) =>
          object({ x: x * TILE_PX + TILE_PX / 2, y: y * TILE_PX + TILE_PX / 2, point: true }),
        ),
      },
    ],
  };
}
