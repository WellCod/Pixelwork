import { describe, expect, it } from 'vitest';
import { TILESET_IDS } from './catalog.generated.ts';
import { compileMap, isWalkable, relocate, zoneAt, type MapError } from './map.ts';
import smallOfficeV1 from './fixtures/small-office-v1.json';
import { FIRSTGID, FURNITURE, buildTestMap, type TestMapOptions } from './testing.ts';

type Mutate = (map: Record<string, unknown>) => void;

const layerOf = (map: Record<string, unknown>, name: string) =>
  (map.layers as Record<string, unknown>[]).find((l) => l.name === name) as Record<string, unknown>;

const valid: TestMapOptions = {
  zones: [
    { key: 'produto', type: 'open', name: 'Product team', x: 1, y: 1, w: 4, h: 6 },
    { key: 'sala-1', type: 'meeting', x: 5, y: 1, w: 4, h: 3 },
  ],
  desks: [{ key: 'mesa-1', x: 2, y: 2, orientation: 'down' }],
  furniture: [{ x: 7, y: 5, tile: FURNITURE.plant }],
  spawns: [[1, 6]],
};

function errorsOf(options: TestMapOptions, mutate?: Mutate): MapError[] {
  const json = buildTestMap(options);
  mutate?.(json);
  const result = compileMap(json);
  return result.ok ? [] : result.errors;
}

describe('compileMap: mapas válidos', () => {
  it('compila parede, móvel com colisão, mesa, zonas e spawn', () => {
    const result = compileMap(buildTestMap(valid));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { map } = result;
    expect(map.width).toBe(10);
    expect(isWalkable(map, 0, 0)).toBe(false);
    expect(isWalkable(map, 1, 1)).toBe(true);
    expect(isWalkable(map, 7, 5)).toBe(false);
    expect(isWalkable(map, 2, 2)).toBe(false);
    expect(map.desks).toEqual([
      { key: 'mesa-1', x: 2, y: 2, w: 1, h: 1, orientation: 'down', chairX: 2, chairY: 3 },
    ]);
    expect(map.spawn).toEqual({ x: 1, y: 6 });
    expect(zoneAt(map, 1, 1)).toMatchObject({ key: 'produto', type: 'open', name: 'Product team' });
    expect(zoneAt(map, 6, 2)).toMatchObject({ key: 'sala-1', type: 'meeting' });
    expect(zoneAt(map, 6, 5).key).toBe('__open');
    expect(map.zones.find((z) => z.key === 'sala-1')?.tiles).toBe(12);
    // O mapa de teste referencia todos os tilesets do catálogo, na ordem dos gids.
    expect(map.tilesets).toEqual([...TILESET_IDS]);
  });

  it('móvel sem colisão não bloqueia', () => {
    const result = compileMap(buildTestMap({ furniture: [{ x: 3, y: 3, tile: FURNITURE.chair }] }));
    expect(result.ok && isWalkable(result.map, 3, 3)).toBe(true);
  });

  it('ignora os bits de espelhamento do gid', () => {
    const flipped = buildTestMap({});
    const walls = layerOf(flipped, 'walls').data as number[];
    walls[11] = FIRSTGID.walls | 0x80000000;
    const compiled = compileMap(flipped);
    expect(compiled.ok && isWalkable(compiled.map, 1, 1)).toBe(false);
  });
});

describe('compileMap: móveis de várias células', () => {
  it('móvel 2x2 colidível bloqueia os 4 tiles da pegada', () => {
    const result = compileMap(buildTestMap({ furniture: [{ x: 3, y: 3, tile: FURNITURE.plant, w: 2, h: 2 }] }));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    // Âncora no canto inferior esquerdo: (3,3) é o tile de baixo à esquerda.
    for (const [x, y] of [[3, 3], [4, 3], [3, 2], [4, 2]] as const) expect(isWalkable(result.map, x, y)).toBe(false);
    expect(isWalkable(result.map, 5, 3)).toBe(true);
  });

  it('móvel grande na última coluna bloqueia só o que está dentro do mapa', () => {
    const result = compileMap(buildTestMap({ furniture: [{ x: 9, y: 4, tile: FURNITURE.plant, w: 3, h: 2 }] }));
    expect(result.ok).toBe(true);
  });

  it('o template salvo antes do redesenho continua compilando com o mesmo resultado', () => {
    const result = compileMap(smallOfficeV1);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect({
      size: [result.map.width, result.map.height],
      walkable: result.map.walkable.reduce((sum, v) => sum + v, 0),
      desks: result.map.desks.map((d) => d.key),
      zones: result.map.zones.map((z) => [z.key, z.tiles]),
    }).toMatchSnapshot();
  });
});

describe('compileMap: mesa de 2 tiles', () => {
  const compiled = (desks: NonNullable<TestMapOptions['desks']>) => compileMap(buildTestMap({ width: 12, height: 10, desks }));

  it('mesa 32x16 virada para baixo bloqueia os dois tiles e a cadeira fica na frente da âncora', () => {
    const result = compiled([{ key: 'mesa-1', x: 3, y: 2, orientation: 'down', size: 2 }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(isWalkable(result.map, 3, 2)).toBe(false);
    expect(isWalkable(result.map, 4, 2)).toBe(false);
    expect(result.map.desks[0]).toEqual({ key: 'mesa-1', x: 3, y: 2, w: 2, h: 1, orientation: 'down', chairX: 3, chairY: 3 });
  });

  it('mesa 16x32 virada para a direita bloqueia os dois tiles e a cadeira fica à direita da âncora', () => {
    const result = compiled([{ key: 'mesa-1', x: 3, y: 2, orientation: 'right', size: 2 }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(isWalkable(result.map, 3, 3)).toBe(false);
    expect(result.map.desks[0]).toMatchObject({ w: 1, h: 2, chairX: 4, chairY: 2 });
  });

  it('pegada fora de 1x1, 2x1 de frente ou 1x2 de lado é desk_size', () => {
    const json = buildTestMap({ width: 12, height: 10, desks: [{ key: 'mesa-1', x: 3, y: 2, orientation: 'down' }] });
    const desk = (layerOf(json, 'desks').objects as Record<string, unknown>[])[0] ?? {};
    desk.width = 32;
    desk.height = 32;
    const result = compileMap(json);
    expect(result.ok ? [] : result.errors).toContainEqual({ code: 'desk_size', deskKey: 'mesa-1' });
    const sideways = compiled([{ key: 'mesa-1', x: 3, y: 2, orientation: 'left', size: 2 }]);
    expect(sideways.ok).toBe(true);
    const json2 = buildTestMap({ width: 12, height: 10, desks: [{ key: 'mesa-2', x: 3, y: 2, orientation: 'left' }] });
    const desk2 = (layerOf(json2, 'desks').objects as Record<string, unknown>[])[0] ?? {};
    desk2.width = 32;
    const result2 = compileMap(json2);
    expect(result2.ok ? [] : result2.errors).toContainEqual({ code: 'desk_size', deskKey: 'mesa-2' });
  });

  it('mesa de 1 tile continua igual (w e h valem 1)', () => {
    const result = compiled([{ key: 'mesa-1', x: 3, y: 2, orientation: 'down' }]);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.map.desks[0]).toEqual({ key: 'mesa-1', x: 3, y: 2, w: 1, h: 1, orientation: 'down', chairX: 3, chairY: 3 });
  });
});

describe('compileMap: custo limitado', () => {
  it('zona e móvel gigantes não percorrem tiles fora do mapa', () => {
    const json = buildTestMap({
      zones: [{ key: 'enorme', type: 'open', x: 1, y: 1, w: 2, h: 2 }],
      furniture: [{ x: 7, y: 5, tile: FURNITURE.plant }],
    });
    const zone = (layerOf(json, 'zones').objects as Record<string, unknown>[])[0] ?? {};
    zone.width = 16 * 1e9;
    zone.height = 16 * 1e9;
    const plant = (layerOf(json, 'furniture').objects as Record<string, unknown>[])[0] ?? {};
    plant.width = 16 * 1e9;
    plant.height = 16 * 1e9;
    const started = Date.now();
    compileMap(json);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('compileMap: um erro por código', () => {
  const cases: [string, TestMapOptions, Mutate | undefined, MapError][] = [
    ['não ortogonal', {}, (m) => (m.orientation = 'isometric'), { code: 'not_orthogonal' }],
    ['infinito', {}, (m) => (m.infinite = true), { code: 'infinite' }],
    ['tile de 32 px', {}, (m) => (m.tilewidth = 32), { code: 'wrong_tile_size' }],
    ['maior que 100x100', {}, (m) => (m.width = 101), { code: 'too_large' }],
    [
      'camada comprimida',
      {},
      (m) => {
        const floor = layerOf(m, 'floor');
        floor.encoding = 'base64';
        floor.data = 'AAAA';
      },
      { code: 'compressed_layer' },
    ],
    [
      'camada ausente',
      {},
      (m) => (m.layers = (m.layers as { name: string }[]).filter((l) => l.name !== 'desks')),
      { code: 'missing_layer', layer: 'desks' },
    ],
    [
      'camada com tipo errado',
      {},
      (m) => (layerOf(m, 'zones').type = 'tilelayer'),
      { code: 'wrong_layer_type', layer: 'zones' },
    ],
    [
      'tileset fora do catálogo',
      {},
      (m) => (m.tilesets as unknown[]).push({ firstgid: 40, source: 'outro.tsj' }),
      { code: 'unknown_tileset', source: 'outro.tsj' },
    ],
    [
      'tileset embutido',
      {},
      (m) => (m.tilesets as unknown[]).push({ firstgid: 40, name: 'x', image: 'x.png' }),
      { code: 'unknown_tileset', source: '(embutido)' },
    ],
    [
      'tilesets que dividem gids',
      {},
      (m) => {
        const desk = (m.tilesets as { firstgid: number; source: string }[]).find((t) => t.source === 'desk-decor.tsj');
        if (desk) desk.firstgid = FIRSTGID.furniture + 1;
      },
      { code: 'tileset_overlap', a: 'furniture', b: 'desk-decor' },
    ],
    [
      'zone_key repetido',
      {
        zones: [
          { key: 'a', type: 'open', x: 1, y: 1, w: 2, h: 2 },
          { key: 'a', type: 'open', x: 4, y: 1, w: 2, h: 2 },
        ],
      },
      undefined,
      { code: 'duplicate_key', kind: 'zone', key: 'a' },
    ],
    [
      'desk_key inválido',
      { desks: [{ key: 'Mesa 1', x: 2, y: 2, orientation: 'down' }] },
      undefined,
      { code: 'invalid_key', kind: 'desk', key: 'Mesa 1' },
    ],
    [
      'zonas sobrepostas',
      {
        zones: [
          { key: 'a', type: 'open', x: 1, y: 1, w: 3, h: 3 },
          { key: 'b', type: 'open', x: 2, y: 2, w: 3, h: 3 },
        ],
      },
      undefined,
      { code: 'zone_overlap', a: 'a', b: 'b' },
    ],
    [
      'zona desalinhada',
      { zones: [{ key: 'a', type: 'open', x: 1, y: 1, w: 2, h: 2 }] },
      (m) => {
        const zone = (layerOf(m, 'zones').objects as Record<string, number>[])[0];
        if (zone) zone.x = 20;
      },
      { code: 'zone_not_aligned', key: 'a' },
    ],
    [
      'tipo de zona inválido',
      { zones: [{ key: 'a', type: 'cozinha', x: 1, y: 1, w: 2, h: 2 }] },
      undefined,
      { code: 'invalid_zone_type', key: 'a' },
    ],
    [
      'cadeira bloqueada',
      { desks: [{ key: 'mesa', x: 2, y: 6, orientation: 'down' }] },
      undefined,
      { code: 'chair_blocked', deskKey: 'mesa' },
    ],
    [
      'orientação inválida',
      { desks: [{ key: 'mesa', x: 2, y: 2, orientation: 'norte' }] },
      undefined,
      { code: 'invalid_orientation', deskKey: 'mesa' },
    ],
    ['dois spawns', { spawns: [[1, 1], [2, 2]] }, undefined, { code: 'spawn_count', found: 2 }],
    ['spawn na parede', { spawns: [[0, 0]] }, undefined, { code: 'spawn_blocked' }],
    [
      'spawn dentro de sala de reunião',
      { zones: [{ key: 'sala', type: 'meeting', x: 1, y: 1, w: 3, h: 3 }], spawns: [[2, 2]] },
      undefined,
      { code: 'spawn_in_meeting' },
    ],
    [
      'camada com tamanho errado',
      {},
      (m) => (layerOf(m, 'floor').data as number[]).pop(),
      { code: 'layer_size', layer: 'floor' },
    ],
    [
      'zona inteira fora do mapa',
      { zones: [{ key: 'longe', type: 'open', x: 50, y: 50, w: 2, h: 2 }] },
      undefined,
      { code: 'zone_outside', key: 'longe' },
    ],
    [
      'mesa fora do mapa',
      { desks: [{ key: 'mesa-1', x: 40, y: 2, orientation: 'down' }] },
      undefined,
      { code: 'desk_outside', deskKey: 'mesa-1' },
    ],
    [
      'duas mesas com a mesma cadeira',
      {
        desks: [
          { key: 'mesa-1', x: 2, y: 2, orientation: 'down' },
          { key: 'mesa-2', x: 2, y: 4, orientation: 'up' },
        ],
      },
      undefined,
      { code: 'chair_shared', a: 'mesa-1', b: 'mesa-2' },
    ],
  ];

  it.each(cases)('%s', (_name, options, mutate, expected) => {
    expect(errorsOf(options, mutate)).toEqual([expected]);
  });

  it('cadeira de uma mesa sobre outra mesa também é bloqueada', () => {
    const errors = errorsOf({
      desks: [
        { key: 'a', x: 2, y: 2, orientation: 'down' },
        { key: 'b', x: 2, y: 3, orientation: 'down' },
      ],
    });
    expect(errors).toEqual([{ code: 'chair_blocked', deskKey: 'a' }]);
  });

  it('entrada que não é objeto', () => {
    expect(compileMap('mapa')).toEqual({ ok: false, errors: [{ code: 'not_orthogonal' }] });
  });
});

describe('relocate', () => {
  const compiled = (options: TestMapOptions) => {
    const result = compileMap(buildTestMap(options));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.map;
  };

  it('fica onde está se o tile continua caminhável', () => {
    expect(relocate(compiled({}), 3, 3)).toEqual({ x: 3, y: 3 });
  });

  it('vai para o tile caminhável mais próximo na mesma zona', () => {
    const map = compiled({ walls: [[3, 3]] });
    const to = relocate(map, 3, 3);
    expect(Math.abs(to.x - 3) + Math.abs(to.y - 3)).toBe(1);
    expect(isWalkable(map, to.x, to.y)).toBe(true);
  });

  it('não atravessa para outra zona mesmo que ela esteja mais perto', () => {
    // Zona "a" é só a coluna x=4, toda parede menos (4,6); o tile livre mais perto de (4,2) fora dela não serve.
    const map = compiled({
      zones: [{ key: 'a', type: 'open', x: 4, y: 1, w: 1, h: 6 }],
      walls: [[4, 1], [4, 2], [4, 3], [4, 4], [4, 5]],
    });
    expect(relocate(map, 4, 2)).toEqual({ x: 4, y: 6 });
  });

  it('sem tile livre na zona, vai para o spawn', () => {
    const map = compiled({
      zones: [{ key: 'ilha', type: 'open', x: 6, y: 5, w: 2, h: 2 }],
      walls: [[6, 5], [7, 5], [6, 6], [7, 6]],
      spawns: [[1, 1]],
    });
    expect(relocate(map, 6, 5)).toEqual({ x: 1, y: 1 });
  });
});
