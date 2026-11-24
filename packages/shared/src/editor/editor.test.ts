import { describe, expect, it } from 'vitest';
import { compileMap, type MapError } from '../map.ts';
import { frameOf } from '../assets.ts';
import { TILESETS } from '../catalog.generated.ts';
import { DIRS } from '../protocol.ts';
import { FIRSTGID, FURNITURE, buildTestMap } from '../testing.ts';
import { apply, objectLayer, propertyValue, type EditorCommand, type ObjectLayerName, type TiledDoc } from './commands.ts';
import { CommandStack } from './history.ts';
import {
  addDesk,
  addDeskGroup,
  deskGroupLayout,
  adoptDocument,
  addZone,
  moveObject,
  moveSpawn,
  objectAt,
  paint,
  placeFurniture,
  removeObject,
  resizeZone,
  rotateDesk,
  rotateGameTable,
  setZoneProps,
} from './operations.ts';

/** Mapa válido de partida: 14x10, uma zona aberta, uma sala, duas mesas, uma planta. */
function baseDoc(): TiledDoc {
  return JSON.parse(
    JSON.stringify(
      buildTestMap({
        width: 14,
        height: 10,
        zones: [
          { key: 'produto', type: 'open', name: 'Produto', x: 1, y: 1, w: 6, h: 4 },
          { key: 'sala', type: 'meeting', name: 'Sala', x: 8, y: 1, w: 4, h: 4 },
        ],
        desks: [
          { key: 'mesa-1', x: 2, y: 2, orientation: 'down' },
          { key: 'mesa-2', x: 4, y: 2, orientation: 'down' },
        ],
        furniture: [{ x: 10, y: 7, tile: FURNITURE.plant }],
        spawns: [[1, 8]],
      }),
    ),
  ) as TiledDoc;
}

const json = (doc: TiledDoc) => JSON.stringify(doc);
const objectId = (doc: TiledDoc, layer: ObjectLayerName, index = 0) => {
  const object = objectLayer(doc, layer).objects[index];
  if (!object) throw new Error(`sem objeto ${index} em ${layer}`);
  return object.id;
};

/** Gerador determinístico (mulberry32): sequências reproduzíveis sem dependência. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ida e volta de cada comando', () => {
  const doc = baseDoc();
  const cases: [string, (currentDoc: TiledDoc) => EditorCommand | null][] = [
    ['pintar parede', (currentDoc) => paint(currentDoc, 'walls', [[3, 6], [4, 6], [3, 6]], FIRSTGID.walls)],
    ['apagar piso', (currentDoc) => paint(currentDoc, 'floor', [[5, 7]], 0)],
    ['pôr móvel', (currentDoc) => placeFurniture(currentDoc, 'furniture', FURNITURE.plant, 6, 7)],
    ['criar zona', (currentDoc) => addZone(currentDoc, { x: 1, y: 6, width: 3, height: 2 }, 'open', 'Copa')],
    ['redimensionar zona', (currentDoc) => resizeZone(currentDoc, objectId(currentDoc, 'zones'), { x: 1, y: 1, width: 5, height: 3 })],
    ['renomear e mudar o tipo da zona', (currentDoc) => setZoneProps(currentDoc, objectId(currentDoc, 'zones'), { name: 'Squad', type: 'meeting' })],
    ['criar mesa', (currentDoc) => addDesk(currentDoc, 6, 2, 'down')],
    ['girar mesa', (currentDoc) => rotateDesk(currentDoc, objectId(currentDoc, 'desks'))],
    ['mover mesa', (currentDoc) => moveObject(currentDoc, 'desks', objectId(currentDoc, 'desks'), 2, 6)],
    ['mover móvel', (currentDoc) => moveObject(currentDoc, 'furniture', objectId(currentDoc, 'furniture'), 11, 8)],
    ['mover spawn', (currentDoc) => moveSpawn(currentDoc, 3, 8)],
    ['remover zona', (currentDoc) => removeObject(currentDoc, 'zones', objectId(currentDoc, 'zones', 1))],
    ['remover mesa', (currentDoc) => removeObject(currentDoc, 'desks', objectId(currentDoc, 'desks'))],
  ];

  it.each(cases)('%s: aplicar, desfazer e refazer devolvem exatamente o estado anterior', (_name, build) => {
    const command = build(doc);
    if (!command) throw new Error('operação não gerou comando');
    const applied = apply(doc, command);
    expect(json(applied.doc)).not.toBe(json(doc));
    const undone = apply(applied.doc, applied.inverse);
    expect(json(undone.doc)).toBe(json(doc));
    const redone = apply(undone.doc, undone.inverse);
    expect(json(redone.doc)).toBe(json(applied.doc));
  });

  it('o documento recebido não é alterado', () => {
    const before = json(doc);
    const command = addZone(doc, { x: 1, y: 6, width: 2, height: 2 }, 'open', 'x');
    if (command) apply(doc, command);
    expect(json(doc)).toBe(before);
  });

  it('operação sem efeito não gera comando', () => {
    expect(paint(doc, 'walls', [[0, 0]], FIRSTGID.walls)).toBeNull();
    expect(paint(doc, 'walls', [[99, 99]], FIRSTGID.walls)).toBeNull();
    expect(moveObject(doc, 'desks', objectId(doc, 'desks'), 2, 2)).toBeNull();
    expect(setZoneProps(doc, objectId(doc, 'zones'), { name: 'Produto' })).toBeNull();
  });
});

describe('pilha de comandos', () => {
  it('desfazer tudo volta ao original e refazer tudo volta ao final', () => {
    const original = baseDoc();
    const stack = new CommandStack(original);
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    stack.execute(paint(stack.doc, 'walls', [[3, 7]], FIRSTGID.walls));
    stack.execute(addZone(stack.doc, { x: 1, y: 6, width: 2, height: 2 }, 'open', 'Copa'));
    const final = json(stack.doc);
    while (stack.canUndo) stack.undo();
    expect(json(stack.doc)).toBe(json(original));
    while (stack.canRedo) stack.redo();
    expect(json(stack.doc)).toBe(final);
  });

  it('comando novo descarta o que dava para refazer', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(paint(stack.doc, 'walls', [[3, 7]], FIRSTGID.walls));
    stack.undo();
    expect(stack.canRedo).toBe(true);
    stack.execute(paint(stack.doc, 'walls', [[4, 7]], FIRSTGID.walls));
    expect(stack.canRedo).toBe(false);
  });
});

describe('chaves estáveis', () => {
  it('mover uma mesa ou uma zona não muda a chave', () => {
    const stack = new CommandStack(baseDoc());
    const deskId = objectId(stack.doc, 'desks');
    const zoneId = objectId(stack.doc, 'zones');
    stack.execute(moveObject(stack.doc, 'desks', deskId, 2, 6));
    stack.execute(rotateDesk(stack.doc, deskId));
    stack.execute(moveObject(stack.doc, 'zones', zoneId, 1, 5));
    const desk = objectLayer(stack.doc, 'desks').objects.find((object) => object.id === deskId);
    const zone = objectLayer(stack.doc, 'zones').objects.find((object) => object.id === zoneId);
    expect(desk && propertyValue(desk, 'desk_key')).toBe('mesa-1');
    expect(zone && propertyValue(zone, 'zone_key')).toBe('produto');
  });

  it('chave nova nunca repete uma apagada', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    const created = objectLayer(stack.doc, 'desks').objects.at(-1);
    expect(created && propertyValue(created, 'desk_key')).toBe('mesa-3');
    stack.execute(removeObject(stack.doc, 'desks', created?.id ?? -1));
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    const again = objectLayer(stack.doc, 'desks').objects.at(-1);
    expect(again && propertyValue(again, 'desk_key')).toBe('mesa-4');
  });

  it('o mapa editado continua no contrato e a chave gerada é aceita pelo compileMap', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 2, 'left'));
    stack.execute(addZone(stack.doc, { x: 1, y: 6, width: 3, height: 2 }, 'meeting', 'Foco'));
    const result = compileMap(stack.doc);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.map.desks.map((desk) => desk.key)).toContain('mesa-3');
    expect(result.map.zones.map((zone) => zone.key)).toContain('zona-1');
  });
});

describe('sequências aleatórias', () => {
  // Erros que uma edição livre pode produzir; qualquer outro indica comando corrompendo o JSON.
  const EXPECTED: MapError['code'][] = ['zone_overlap', 'chair_blocked', 'chair_shared', 'spawn_blocked', 'spawn_in_meeting'];

  function randomCommand(doc: TiledDoc, random: () => number): EditorCommand | null {
    const x = Math.floor(random() * doc.width);
    const y = Math.floor(random() * doc.height);
    const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(random() * items.length)];
    const someId = (layer: ObjectLayerName) => pick(objectLayer(doc, layer).objects)?.id;
    switch (Math.floor(random() * 11)) {
      case 0:
        return paint(doc, 'walls', [[x, y], [x + 1, y]], random() < 0.7 ? FIRSTGID.walls : 0);
      case 1:
        return paint(doc, 'floor', [[x, y]], pick([FIRSTGID.floors, FIRSTGID.floors + 1, 0]) ?? 0);
      case 2:
        return placeFurniture(doc, 'furniture', pick([FURNITURE.plant, FURNITURE.chair]) ?? 0, x, y);
      case 3:
        return addZone(doc, { x, y, width: 1 + Math.floor(random() * 4), height: 1 + Math.floor(random() * 3) }, random() < 0.5 ? 'open' : 'meeting', 'Z');
      case 4:
        return addDesk(doc, x, y, pick(DIRS) ?? 'down');
      case 5: {
        const id = someId('desks');
        return id === undefined ? null : rotateDesk(doc, id);
      }
      case 6: {
        const layer = pick(['desks', 'zones', 'furniture'] as const) ?? 'desks';
        const id = someId(layer);
        return id === undefined ? null : moveObject(doc, layer, id, x, y);
      }
      case 7: {
        const layer = pick(['desks', 'zones', 'furniture'] as const) ?? 'desks';
        const id = someId(layer);
        return id === undefined ? null : removeObject(doc, layer, id);
      }
      case 8:
        return moveSpawn(doc, x, y);
      case 9: {
        const id = someId('zones');
        return id === undefined ? null : setZoneProps(doc, id, { type: random() < 0.5 ? 'open' : 'meeting', name: `n${x}` });
      }
      default: {
        const id = someId('zones');
        return id === undefined ? null : resizeZone(doc, id, { x, y, width: 2, height: 2 });
      }
    }
  }

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('semente %i: só erros esperados, e desfazer tudo volta ao início', (seed) => {
    const random = prng(seed);
    const original = baseDoc();
    const stack = new CommandStack(original);
    for (let i = 0; i < 60; i++) stack.execute(randomCommand(stack.doc, random));
    expect(stack.canUndo).toBe(true);

    const result = compileMap(stack.doc);
    const unexpected = result.ok ? [] : result.errors.filter((error) => !EXPECTED.includes(error.code));
    expect(unexpected).toEqual([]);

    while (stack.canUndo) stack.undo();
    expect(json(stack.doc)).toBe(json(original));
  });

  it('as sequências chegam a produzir os erros esperados (o teste não é vazio)', () => {
    const codes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const random = prng(seed);
      const stack = new CommandStack(baseDoc());
      for (let i = 0; i < 60; i++) stack.execute(randomCommand(stack.doc, random));
      const result = compileMap(stack.doc);
      if (!result.ok) for (const error of result.errors) codes.add(error.code);
    }
    expect(codes.size).toBeGreaterThan(0);
  });
});

describe('objectAt', () => {
  it('acha zona pela área, móvel pela âncora inferior e mesa pelo tile', () => {
    const doc = baseDoc();
    expect(objectAt(doc, 'zones', 3, 3)?.id).toBe(objectId(doc, 'zones'));
    expect(objectAt(doc, 'furniture', 10, 7)?.id).toBe(objectId(doc, 'furniture'));
    expect(objectAt(doc, 'desks', 4, 2)?.id).toBe(objectId(doc, 'desks', 1));
    expect(objectAt(doc, 'desks', 9, 9)).toBeUndefined();
  });
});

describe('adoptDocument', () => {
  it('modelo com chave já usada no mapa atual ganha chave nova, e o contador segue o maior', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    const used = propertyValue(stack.doc, 'pixelwork_next_desk');
    const template = baseDoc();
    const adopted = adoptDocument(stack.doc, template);
    const keys = objectLayer(adopted, 'desks').objects.map((object) => propertyValue(object, 'desk_key'));
    const old = objectLayer(stack.doc, 'desks').objects.map((object) => propertyValue(object, 'desk_key'));
    for (const key of keys) expect(old).not.toContain(key);
    expect(Number(propertyValue(adopted, 'pixelwork_next_desk'))).toBeGreaterThan(Number(used));
    expect(compileMap(adopted).ok).toBe(true);
    // O modelo original não é alterado.
    expect(objectLayer(template, 'desks').objects.map((object) => propertyValue(object, 'desk_key'))).not.toEqual(keys);
  });
});

describe('móveis de várias células', () => {
  const lastFurniture = (doc: TiledDoc) => objectLayer(doc, 'furniture').objects.at(-1);

  it('sofá 2x1 é gravado com 32x16, ancorado no canto inferior esquerdo do tile clicado', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(placeFurniture(stack.doc, 'furniture-2x1', 0, 3, 6));
    expect(lastFurniture(stack.doc)).toMatchObject({ x: 3 * 16, y: 7 * 16, width: 32, height: 16 });
  });

  it('móvel de várias células não é colocado nem movido com parte fora do mapa', () => {
    const doc = baseDoc();
    expect(placeFurniture(doc, 'furniture-2x1', 0, doc.width - 1, 6)).toBeNull();
    expect(placeFurniture(doc, 'furniture-2x2', 0, 3, 0)).toBeNull();
    expect(placeFurniture(doc, 'furniture-2x1', 0, doc.width - 2, 6)).not.toBeNull();
    const stack = new CommandStack(doc);
    stack.execute(placeFurniture(stack.doc, 'furniture-2x1', 0, 3, 6));
    const id = lastFurniture(stack.doc)?.id ?? -1;
    expect(moveObject(stack.doc, 'furniture', id, doc.width - 1, 6)).toBeNull();
  });

  it('tileset novo ganha um firstgid que não cruza com os do mapa (mapa editado no Tiled)', () => {
    const doc = baseDoc();
    const refs = (doc.tilesets as { firstgid: number; source: string }[]).filter((tilesetRef) => tilesetRef.source !== 'furniture-2x1.tsj');
    // O Tiled compacta os firstgid: aqui o desk-decor ocupa a faixa onde o bloco de 100 do 2x1 cairia.
    const decor = refs.find((tilesetRef) => tilesetRef.source === 'desk-decor.tsj');
    if (decor) decor.firstgid = 390;
    doc.tilesets = refs;
    const stack = new CommandStack(doc);
    stack.execute(placeFurniture(stack.doc, 'furniture-2x1', 0, 3, 6));
    const ranges = (stack.doc.tilesets as { firstgid: number; source: string }[]).map((tilesetRef) => {
      const id = tilesetRef.source.replace(/\.tsj$/, '') as keyof typeof TILESETS;
      return [tilesetRef.firstgid, tilesetRef.firstgid + TILESETS[id].tilecount] as const;
    });
    for (const [start, end] of ranges) {
      expect(ranges.filter(([otherStart, otherEnd]) => start < otherEnd && otherStart < end)).toHaveLength(1);
    }
  });

  it('mesa larga não é criada nem movida com um tile para fora do mapa', () => {
    const doc = baseDoc();
    expect(addDesk(doc, doc.width - 1, 2, 'down')).toBeNull();
    expect(addDesk(doc, 2, doc.height - 1, 'left')).toBeNull();
    const stack = new CommandStack(doc);
    stack.execute(addDesk(stack.doc, 2, 2, 'down'));
    const wide = objectLayer(stack.doc, 'desks').objects.at(-1)?.id ?? -1;
    expect(moveObject(stack.doc, 'desks', wide, doc.width - 1, 2)).toBeNull();
    expect(moveObject(stack.doc, 'desks', wide, doc.width - 2, 2)).not.toBeNull();
  });

  it('objectAt acha a mesa larga clicando em qualquer um dos dois tiles', () => {
    const stack = new CommandStack(baseDoc());
    const add = addDesk(stack.doc, 8, 8, 'down');
    if (!add) throw new Error('mesa fora do mapa');
    stack.execute(add);
    const id = objectLayer(stack.doc, 'desks').objects.at(-1)?.id;
    expect(objectAt(stack.doc, 'desks', 8, 8)?.id).toBe(id);
    expect(objectAt(stack.doc, 'desks', 9, 8)?.id).toBe(id);
    expect(objectAt(stack.doc, 'desks', 10, 8)?.id).not.toBe(id);
  });

  it('objectAt acha o sofá clicando em qualquer um dos dois tiles', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(placeFurniture(stack.doc, 'furniture-2x1', 0, 3, 6));
    const id = lastFurniture(stack.doc)?.id;
    expect(objectAt(stack.doc, 'furniture', 3, 6)?.id).toBe(id);
    expect(objectAt(stack.doc, 'furniture', 4, 6)?.id).toBe(id);
    expect(objectAt(stack.doc, 'furniture', 5, 6)?.id).not.toBe(id);
  });

  it('mapa sem o tileset ganha a referência no mesmo comando, e desfazer volta idêntico', () => {
    const doc = baseDoc();
    doc.tilesets = (doc.tilesets as { firstgid: number; source: string }[]).filter((tilesetRef) => tilesetRef.source !== 'furniture-2x1.tsj');
    const before = json(doc);
    const stack = new CommandStack(doc);
    stack.execute(placeFurniture(stack.doc, 'furniture-2x1', 1, 2, 6));
    const refs = stack.doc.tilesets as { firstgid: number; source: string }[];
    const ref = refs.find((tilesetRef) => tilesetRef.source === 'furniture-2x1.tsj');
    expect(ref?.firstgid).toBe(FIRSTGID['furniture-2x1']);
    expect(lastFurniture(stack.doc)?.gid).toBe(FIRSTGID['furniture-2x1'] + 1);
    expect(compileMap(stack.doc).ok).toBe(true);
    stack.undo();
    expect(json(stack.doc)).toBe(before);
  });
});

describe('mesa de 2 tiles no editor', () => {
  const lastDesk = (doc: TiledDoc) => objectLayer(doc, 'desks').objects.at(-1);

  it('mesa nova virada para baixo tem 32x16; para o lado, 16x32', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 5, 'down'));
    expect(lastDesk(stack.doc)).toMatchObject({ width: 32, height: 16 });
    stack.execute(addDesk(stack.doc, 2, 6, 'left'));
    expect(lastDesk(stack.doc)).toMatchObject({ width: 16, height: 32 });
  });

  it('girar troca largura e altura e continua no contrato', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 5, 'down'));
    const id = lastDesk(stack.doc)?.id ?? -1;
    stack.execute(rotateDesk(stack.doc, id));
    expect(lastDesk(stack.doc)).toMatchObject({ width: 16, height: 32 });
    expect(propertyValue(lastDesk(stack.doc) ?? {}, 'orientation')).toBe('left');
    const result = compileMap(stack.doc);
    expect(result.ok ? [] : result.errors.filter((error) => error.code === 'desk_size')).toEqual([]);
  });

  it('mesa larga girada encostada na parede dá chair_blocked, sem exceção', () => {
    const stack = new CommandStack(baseDoc());
    // Borda esquerda: virada para a esquerda, a cadeira cairia na parede (x = 0).
    stack.execute(addDesk(stack.doc, 1, 6, 'up'));
    const id = lastDesk(stack.doc)?.id ?? -1;
    stack.execute(rotateDesk(stack.doc, id)); // up -> right
    stack.execute(rotateDesk(stack.doc, id)); // right -> down
    stack.execute(rotateDesk(stack.doc, id)); // down -> left
    const result = compileMap(stack.doc);
    const key = propertyValue(lastDesk(stack.doc) ?? {}, 'desk_key');
    expect(result.ok ? [] : result.errors).toContainEqual({ code: 'chair_blocked', deskKey: key });
  });
});

describe('rotação de mesas de jogos', () => {
  it.each(['ping-pong', 'foosball'])('gira %s, preserva âncora e id e desfaz a adição do tileset', (item) => {
    const doc = baseDoc();
    const refs = doc.tilesets as { firstgid: number; source: string }[];
    doc.tilesets = refs.filter((ref) => ref.source !== 'furniture-2x3.tsj');
    const stack = new CommandStack(doc);
    stack.execute(placeFurniture(stack.doc, 'furniture-3x2', frameOf('furniture-3x2', item), 9, 7));
    const id = objectId(stack.doc, 'furniture', 1);
    const before = json(stack.doc);
    stack.execute(rotateGameTable(stack.doc, id));
    const rotated = objectLayer(stack.doc, 'furniture').objects[1];
    expect(rotated).toMatchObject({ id, x: 144, y: 144, width: 32, height: 48, rotation: 0 });
    expect(stack.doc.tilesets).toContainEqual({ firstgid: FIRSTGID['furniture-2x3'], source: 'furniture-2x3.tsj' });
    expect(objectAt(stack.doc, 'furniture', 9, 8)?.id).toBe(id);
    expect(compileMap(stack.doc).ok).toBe(true);
    const after = json(stack.doc);
    stack.undo();
    expect(json(stack.doc)).toBe(before);
    stack.redo();
    expect(json(stack.doc)).toBe(after);
    stack.execute(rotateGameTable(stack.doc, id));
    expect(objectLayer(stack.doc, 'furniture').objects[1]).toMatchObject({ id, x: 144, y: 128, width: 48, height: 32 });
  });

  it('recusa a rotação que colocaria a mesa para fora do mapa', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(placeFurniture(stack.doc, 'furniture-3x2', frameOf('furniture-3x2', 'ping-pong'), 9, 9));
    expect(rotateGameTable(stack.doc, objectId(stack.doc, 'furniture', 1))).toBeNull();
  });
});

describe('bancadas de trabalho', () => {
  it.each(['down', 'right'] as const)('cria uma espinha %s com chaves e cadeiras individuais, e desfaz o conjunto', (direction) => {
    const doc = buildTestMap({ width: 14, height: 12, spawns: [[1, 1]] }) as unknown as TiledDoc;
    const placements = deskGroupLayout(3, 3, direction, 'spine', 3);
    const stack = new CommandStack(doc);
    stack.execute(addDeskGroup(stack.doc, 3, 3, direction, 'spine', 3));
    const result = compileMap(stack.doc);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { desks, walkable, width } = result.map;
    expect(desks).toHaveLength(6);
    expect(new Set(desks.map((desk) => desk.key)).size).toBe(6);
    expect(desks).toMatchObject(placements);
    for (const desk of desks) {
      expect(walkable[desk.chairY * width + desk.chairX]).toBe(1);
      for (let y = desk.y; y < desk.y + desk.height; y++) {
        for (let x = desk.x; x < desk.x + desk.width; x++) expect(walkable[y * width + x]).toBe(0);
      }
    }
    expect(desks.map((desk) => desk.orientation)).toEqual(direction === 'down' ? ['up', 'up', 'up', 'down', 'down', 'down'] : ['left', 'left', 'left', 'right', 'right', 'right']);
    const saved = json(stack.doc);
    stack.undo();
    expect(json(stack.doc)).toBe(json(doc));
    stack.redo();
    expect(json(stack.doc)).toBe(saved);
  });

  it('fileira mantém as cadeiras do mesmo lado e não bloqueia mesas, paredes nem spawn existentes', () => {
    const doc = buildTestMap({
      width: 14,
      height: 12,
      spawns: [[1, 1]],
      walls: [[3, 4]],
      desks: [{ key: 'mesa-1', x: 8, y: 4, orientation: 'down' }],
    }) as unknown as TiledDoc;
    expect(deskGroupLayout(2, 2, 'down', 'row', 3).map((desk) => [desk.x, desk.y, desk.chairX, desk.chairY]))
      .toEqual([[2, 2, 2, 3], [4, 2, 4, 3], [6, 2, 6, 3]]);
    expect(addDeskGroup(doc, 2, 2, 'down', 'row', 3)).not.toBeNull();
    expect(addDeskGroup(doc, 3, 3, 'down', 'row', 2)).toBeNull();
    expect(addDeskGroup(doc, 8, 5, 'down', 'row', 2)).toBeNull();
    expect(addDeskGroup(doc, 1, 1, 'down', 'row', 2)).toBeNull();
    expect(addDeskGroup(doc, 12, 10, 'down', 'spine', 3)).toBeNull();
  });
});
