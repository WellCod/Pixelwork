import { describe, expect, it } from 'vitest';
import { compileMap, type MapError } from '../map.ts';
import { DIRS } from '../protocol.ts';
import { FIRSTGID, FURNITURE, buildTestMap } from '../testing.ts';
import { apply, objectLayer, prop, type EditorCommand, type ObjectLayerName, type TiledDoc } from './commands.ts';
import { CommandStack } from './history.ts';
import {
  addDesk,
  addZone,
  moveObject,
  moveSpawn,
  objectAt,
  paint,
  placeFurniture,
  removeObject,
  resizeZone,
  rotateDesk,
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
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ida e volta de cada comando', () => {
  const doc = baseDoc();
  const cases: [string, (d: TiledDoc) => EditorCommand | null][] = [
    ['pintar parede', (d) => paint(d, 'walls', [[3, 6], [4, 6], [3, 6]], FIRSTGID.walls)],
    ['apagar piso', (d) => paint(d, 'floor', [[5, 7]], 0)],
    ['pôr móvel', (d) => placeFurniture(d, FIRSTGID.furniture + FURNITURE.plant, 6, 7)],
    ['criar zona', (d) => addZone(d, { x: 1, y: 6, w: 3, h: 2 }, 'open', 'Copa')],
    ['redimensionar zona', (d) => resizeZone(d, objectId(d, 'zones'), { x: 1, y: 1, w: 5, h: 3 })],
    ['renomear e mudar o tipo da zona', (d) => setZoneProps(d, objectId(d, 'zones'), { name: 'Squad', type: 'meeting' })],
    ['criar mesa', (d) => addDesk(d, 6, 2, 'down')],
    ['girar mesa', (d) => rotateDesk(d, objectId(d, 'desks'))],
    ['mover mesa', (d) => moveObject(d, 'desks', objectId(d, 'desks'), 2, 6)],
    ['mover móvel', (d) => moveObject(d, 'furniture', objectId(d, 'furniture'), 11, 8)],
    ['mover spawn', (d) => moveSpawn(d, 3, 8)],
    ['remover zona', (d) => removeObject(d, 'zones', objectId(d, 'zones', 1))],
    ['remover mesa', (d) => removeObject(d, 'desks', objectId(d, 'desks'))],
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
    const command = addZone(doc, { x: 1, y: 6, w: 2, h: 2 }, 'open', 'x');
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
    stack.execute(addZone(stack.doc, { x: 1, y: 6, w: 2, h: 2 }, 'open', 'Copa'));
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
    const desk = objectLayer(stack.doc, 'desks').objects.find((o) => o.id === deskId);
    const zone = objectLayer(stack.doc, 'zones').objects.find((o) => o.id === zoneId);
    expect(desk && prop(desk, 'desk_key')).toBe('mesa-1');
    expect(zone && prop(zone, 'zone_key')).toBe('produto');
  });

  it('chave nova nunca repete uma apagada', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    const created = objectLayer(stack.doc, 'desks').objects.at(-1);
    expect(created && prop(created, 'desk_key')).toBe('mesa-3');
    stack.execute(removeObject(stack.doc, 'desks', created?.id ?? -1));
    stack.execute(addDesk(stack.doc, 6, 2, 'down'));
    const again = objectLayer(stack.doc, 'desks').objects.at(-1);
    expect(again && prop(again, 'desk_key')).toBe('mesa-4');
  });

  it('o mapa editado continua no contrato e a chave gerada é aceita pelo compileMap', () => {
    const stack = new CommandStack(baseDoc());
    stack.execute(addDesk(stack.doc, 6, 2, 'left'));
    stack.execute(addZone(stack.doc, { x: 1, y: 6, w: 3, h: 2 }, 'meeting', 'Foco'));
    const result = compileMap(stack.doc);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.map.desks.map((d) => d.key)).toContain('mesa-3');
    expect(result.map.zones.map((z) => z.key)).toContain('zona-1');
  });
});

describe('sequências aleatórias', () => {
  // Erros que uma edição livre pode produzir; qualquer outro indica comando corrompendo o JSON.
  const EXPECTED: MapError['code'][] = ['zone_overlap', 'chair_blocked', 'spawn_blocked'];

  function randomCommand(doc: TiledDoc, rand: () => number): EditorCommand | null {
    const x = Math.floor(rand() * doc.width);
    const y = Math.floor(rand() * doc.height);
    const pick = <T>(items: readonly T[]): T | undefined => items[Math.floor(rand() * items.length)];
    const someId = (layer: ObjectLayerName) => pick(objectLayer(doc, layer).objects)?.id;
    switch (Math.floor(rand() * 11)) {
      case 0:
        return paint(doc, 'walls', [[x, y], [x + 1, y]], rand() < 0.7 ? FIRSTGID.walls : 0);
      case 1:
        return paint(doc, 'floor', [[x, y]], pick([FIRSTGID.floors, FIRSTGID.floors + 1, 0]) ?? 0);
      case 2:
        return placeFurniture(doc, FIRSTGID.furniture + (pick([FURNITURE.plant, FURNITURE.chair]) ?? 0), x, y);
      case 3:
        return addZone(doc, { x, y, w: 1 + Math.floor(rand() * 4), h: 1 + Math.floor(rand() * 3) }, rand() < 0.5 ? 'open' : 'meeting', 'Z');
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
        return id === undefined ? null : setZoneProps(doc, id, { type: rand() < 0.5 ? 'open' : 'meeting', name: `n${x}` });
      }
      default: {
        const id = someId('zones');
        return id === undefined ? null : resizeZone(doc, id, { x, y, w: 2, h: 2 });
      }
    }
  }

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('semente %i: só erros esperados, e desfazer tudo volta ao início', (seed) => {
    const rand = prng(seed);
    const original = baseDoc();
    const stack = new CommandStack(original);
    for (let i = 0; i < 60; i++) stack.execute(randomCommand(stack.doc, rand));
    expect(stack.canUndo).toBe(true);

    const result = compileMap(stack.doc);
    const unexpected = result.ok ? [] : result.errors.filter((e) => !EXPECTED.includes(e.code));
    expect(unexpected).toEqual([]);

    while (stack.canUndo) stack.undo();
    expect(json(stack.doc)).toBe(json(original));
  });

  it('as sequências chegam a produzir os erros esperados (o teste não é vazio)', () => {
    const codes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const rand = prng(seed);
      const stack = new CommandStack(baseDoc());
      for (let i = 0; i < 60; i++) stack.execute(randomCommand(stack.doc, rand));
      const result = compileMap(stack.doc);
      if (!result.ok) for (const e of result.errors) codes.add(e.code);
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
