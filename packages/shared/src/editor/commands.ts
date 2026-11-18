// Comandos do editor de mapa. Operam direto no JSON do Tiled (não há formato intermediário) e
// são puros: aplicar devolve o documento novo e o comando inverso, que desfaz exatamente.

export interface TiledProperty {
  name: string;
  type: string;
  value: unknown;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  gid?: number;
  point?: boolean;
  properties?: TiledProperty[];
}

export interface TileLayer {
  name: string;
  type: 'tilelayer';
  data: number[];
  [key: string]: unknown;
}

export interface ObjectLayer {
  name: string;
  type: 'objectgroup';
  objects: TiledObject[];
  [key: string]: unknown;
}

export interface TiledDoc {
  width: number;
  height: number;
  nextobjectid?: number;
  properties?: TiledProperty[];
  layers: (TileLayer | ObjectLayer)[];
  [key: string]: unknown;
}

export type TileLayerName = 'floor' | 'walls';
export type ObjectLayerName = 'furniture' | 'zones' | 'desks' | 'spawn';

export type EditorCommand =
  | { kind: 'paint'; layer: TileLayerName; cells: { i: number; gid: number }[] }
  | { kind: 'addObject'; layer: ObjectLayerName; object: TiledObject; index?: number }
  | { kind: 'removeObject'; layer: ObjectLayerName; id: number }
  /** Troca o objeto de mesmo id pela versão dada; o inverso guarda a versão anterior inteira. */
  | { kind: 'replaceObject'; layer: ObjectLayerName; object: TiledObject }
  /** Campos do topo do mapa (`nextobjectid`, `properties`); `undefined` remove o campo. */
  | { kind: 'setDocFields'; fields: DocFields }
  | { kind: 'batch'; commands: EditorCommand[] };

/** `undefined` explícito: no desfazer, remove o campo que não existia. */
export interface DocFields {
  nextobjectid?: number | undefined;
  properties?: TiledProperty[] | undefined;
}

export class EditorError extends Error {}

function tileLayer(doc: TiledDoc, name: TileLayerName): TileLayer {
  const layer = doc.layers.find((l): l is TileLayer => l.name === name && l.type === 'tilelayer');
  if (!layer) throw new EditorError(`camada de tiles "${name}" ausente`);
  return layer;
}

export function objectLayer(doc: TiledDoc, name: ObjectLayerName): ObjectLayer {
  const layer = doc.layers.find((l): l is ObjectLayer => l.name === name && l.type === 'objectgroup');
  if (!layer) throw new EditorError(`camada de objetos "${name}" ausente`);
  return layer;
}

/** Cópia rasa do documento com uma camada trocada: o resto é compartilhado. */
function withLayer(doc: TiledDoc, layer: TileLayer | ObjectLayer): TiledDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.name === layer.name ? layer : l)) };
}

export function prop(object: { properties?: TiledProperty[] }, name: string): unknown {
  return object.properties?.find((p) => p.name === name)?.value;
}

export function apply(doc: TiledDoc, command: EditorCommand): { doc: TiledDoc; inverse: EditorCommand } {
  switch (command.kind) {
    case 'paint': {
      const layer = tileLayer(doc, command.layer);
      const data = [...layer.data];
      const previous = command.cells.map(({ i }) => ({ i, gid: data[i] ?? 0 }));
      for (const { i, gid } of command.cells) {
        if (i < 0 || i >= data.length) throw new EditorError(`tile fora do mapa: ${i}`);
        data[i] = gid;
      }
      // Desfeito na ordem contrária, para o mesmo tile pintado duas vezes voltar ao original.
      return {
        doc: withLayer(doc, { ...layer, data }),
        inverse: { kind: 'paint', layer: command.layer, cells: previous.reverse() },
      };
    }
    case 'addObject': {
      const layer = objectLayer(doc, command.layer);
      if (layer.objects.some((o) => o.id === command.object.id)) {
        throw new EditorError(`objeto ${command.object.id} já existe`);
      }
      const objects = [...layer.objects];
      objects.splice(command.index ?? objects.length, 0, command.object);
      return {
        doc: withLayer(doc, { ...layer, objects }),
        inverse: { kind: 'removeObject', layer: command.layer, id: command.object.id },
      };
    }
    case 'removeObject': {
      const layer = objectLayer(doc, command.layer);
      const index = layer.objects.findIndex((o) => o.id === command.id);
      const object = layer.objects[index];
      if (!object) throw new EditorError(`objeto ${command.id} não existe`);
      return {
        doc: withLayer(doc, { ...layer, objects: layer.objects.filter((o) => o.id !== command.id) }),
        inverse: { kind: 'addObject', layer: command.layer, object, index },
      };
    }
    case 'replaceObject': {
      const layer = objectLayer(doc, command.layer);
      const previous = layer.objects.find((o) => o.id === command.object.id);
      if (!previous) throw new EditorError(`objeto ${command.object.id} não existe`);
      return {
        doc: withLayer(doc, {
          ...layer,
          objects: layer.objects.map((o) => (o.id === command.object.id ? command.object : o)),
        }),
        inverse: { kind: 'replaceObject', layer: command.layer, object: previous },
      };
    }
    case 'setDocFields': {
      const next: TiledDoc = { ...doc };
      const previous: DocFields = {};
      if ('nextobjectid' in command.fields) {
        previous.nextobjectid = doc.nextobjectid;
        if (command.fields.nextobjectid === undefined) delete next.nextobjectid;
        else next.nextobjectid = command.fields.nextobjectid;
      }
      if ('properties' in command.fields) {
        previous.properties = doc.properties;
        if (command.fields.properties === undefined) delete next.properties;
        else next.properties = command.fields.properties;
      }
      return { doc: next, inverse: { kind: 'setDocFields', fields: previous } };
    }
    case 'batch': {
      let current = doc;
      const inverses: EditorCommand[] = [];
      for (const inner of command.commands) {
        const result = apply(current, inner);
        current = result.doc;
        inverses.unshift(result.inverse);
      }
      return { doc: current, inverse: { kind: 'batch', commands: inverses } };
    }
  }
}
