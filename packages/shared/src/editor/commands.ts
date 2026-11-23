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

export interface TilesetRef {
  firstgid: number;
  source: string;
}

/** Documento do Tiled como o editor o vê; campos desconhecidos passam intactos. */
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

/** Comando aplicável ao documento; `paint.cells[].i` é o índice do tile (y * width + x). */
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
  /** Referências aos tilesets do catálogo; cresce quando o mapa passa a usar um tileset novo. */
  tilesets?: TilesetRef[] | undefined;
}

/** Comando que não se aplica ao documento (camada ausente, objeto inexistente, tile fora). */
export class EditorError extends Error {}

function tileLayer(doc: TiledDoc, name: TileLayerName): TileLayer {
  const layer = doc.layers.find((candidate): candidate is TileLayer => candidate.name === name && candidate.type === 'tilelayer');
  if (!layer) throw new EditorError(`camada de tiles "${name}" ausente`);
  return layer;
}

/** Camada de objetos pelo nome; ausente é erro. */
export function objectLayer(doc: TiledDoc, name: ObjectLayerName): ObjectLayer {
  const layer = doc.layers.find((candidate): candidate is ObjectLayer => candidate.name === name && candidate.type === 'objectgroup');
  if (!layer) throw new EditorError(`camada de objetos "${name}" ausente`);
  return layer;
}

/** Cópia rasa do documento com uma camada trocada: o resto é compartilhado. */
function withLayer(doc: TiledDoc, layer: TileLayer | ObjectLayer): TiledDoc {
  return { ...doc, layers: doc.layers.map((existing) => (existing.name === layer.name ? layer : existing)) };
}

/** Valor da propriedade do Tiled `name`, ou undefined. */
export function prop(object: { properties?: TiledProperty[] }, name: string): unknown {
  return object.properties?.find((property) => property.name === name)?.value;
}

/** Propriedade como texto (vazio se faltar ou não for string). */
export function textProp(object: { properties?: TiledProperty[] }, name: string, fallback = ''): string {
  const value = prop(object, name);
  return typeof value === 'string' ? value : fallback;
}

/** Aplica o comando sem alterar `doc`; devolve o documento novo e o comando que o desfaz. */
export function apply(doc: TiledDoc, command: EditorCommand): { doc: TiledDoc; inverse: EditorCommand } {
  switch (command.kind) {
    case 'paint': {
      const layer = tileLayer(doc, command.layer);
      const data = [...layer.data];
      const previous = command.cells.map(({ i: tileIndex }) => ({ i: tileIndex, gid: data[tileIndex] ?? 0 }));
      for (const { i: tileIndex, gid } of command.cells) {
        if (tileIndex < 0 || tileIndex >= data.length) throw new EditorError(`tile fora do mapa: ${tileIndex}`);
        data[tileIndex] = gid;
      }
      // Desfeito na ordem contrária, para o mesmo tile pintado duas vezes voltar ao original.
      return {
        doc: withLayer(doc, { ...layer, data }),
        inverse: { kind: 'paint', layer: command.layer, cells: previous.reverse() },
      };
    }
    case 'addObject': {
      const layer = objectLayer(doc, command.layer);
      if (layer.objects.some((object) => object.id === command.object.id)) {
        throw new EditorError(`objeto ${command.object.id} já existe`);
      }
      const objects = [...layer.objects];
      // Sem `index`, entra no fim; com ele (vindo do desfazer de uma remoção), volta à posição original.
      objects.splice(command.index ?? objects.length, 0, command.object);
      return {
        doc: withLayer(doc, { ...layer, objects }),
        inverse: { kind: 'removeObject', layer: command.layer, id: command.object.id },
      };
    }
    case 'removeObject': {
      const layer = objectLayer(doc, command.layer);
      const index = layer.objects.findIndex((object) => object.id === command.id);
      const removed = layer.objects[index];
      if (!removed) throw new EditorError(`objeto ${command.id} não existe`);
      return {
        doc: withLayer(doc, { ...layer, objects: layer.objects.filter((object) => object.id !== command.id) }),
        inverse: { kind: 'addObject', layer: command.layer, object: removed, index },
      };
    }
    case 'replaceObject': {
      const layer = objectLayer(doc, command.layer);
      const previous = layer.objects.find((object) => object.id === command.object.id);
      if (!previous) throw new EditorError(`objeto ${command.object.id} não existe`);
      return {
        doc: withLayer(doc, {
          ...layer,
          objects: layer.objects.map((object) => (object.id === command.object.id ? command.object : object)),
        }),
        inverse: { kind: 'replaceObject', layer: command.layer, object: previous },
      };
    }
    case 'setDocFields': {
      // Só os campos presentes em `fields` mudam; o inverso guarda o valor anterior de cada um
      // (undefined quando o campo não existia, para o desfazer apagá-lo).
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
      if ('tilesets' in command.fields) {
        previous.tilesets = doc.tilesets as TilesetRef[] | undefined;
        if (command.fields.tilesets === undefined) delete next.tilesets;
        else next.tilesets = command.fields.tilesets;
      }
      return { doc: next, inverse: { kind: 'setDocFields', fields: previous } };
    }
    case 'batch': {
      // Aplica em ordem; os inversos ficam em ordem contrária para o desfazer andar de trás para frente.
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
