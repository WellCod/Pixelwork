import { TILESETS, compileMap, type Dir, type MapError, type TilesetId } from '@pixelwork/shared';
import {
  CommandStack,
  addDesk,
  addZone,
  moveObject,
  moveSpawn,
  objectAt,
  paint,
  placeFurniture,
  removeObject,
  rotateDesk,
  setZoneProps,
  type ObjectLayerName,
  type TileRect,
  type TiledDoc,
  type ZoneType,
} from '@pixelwork/shared/editor';

export type Tool = 'select' | 'floor' | 'wall' | 'erase' | 'furniture' | 'zone' | 'desk' | 'spawn';

export interface Selection {
  layer: ObjectLayerName;
  id: number;
}

export const FLOOR_OPTIONS = [
  { frame: 0, label: 'Madeira' },
  { frame: 1, label: 'Carpete' },
  { frame: 2, label: 'Cozinha' },
] as const;

/** Tile de parede usado pelo pincel (a face, como no template). */
const WALL_FRAME = 1;

/** Ordem de clique na ferramenta de seleção: o que fica por cima primeiro. */
const PICK_ORDER: ObjectLayerName[] = ['spawn', 'desks', 'furniture', 'zones'];

function firstGid(doc: TiledDoc, id: TilesetId): number | null {
  const refs = doc.tilesets as { firstgid: number; source: string }[] | undefined;
  return refs?.find((t) => t.source === `${id}.tsj`)?.firstgid ?? null;
}

/** Móveis do catálogo com o frame no tileset `furniture`. */
export const FURNITURE_OPTIONS = Object.entries(TILESETS.furniture.items).map(([frame, item]) => ({
  frame: Number(frame),
  item,
}));

/**
 * Estado do editor fora do Phaser: pilha de comandos, ferramenta, opções e seleção. A cena só
 * desenha e traduz o mouse em chamadas daqui; o painel em React lê e muda o mesmo estado.
 */
export class EditorController {
  readonly stack: CommandStack;
  tool: Tool = 'select';
  floorFrame = 0;
  furnitureFrame = FURNITURE_OPTIONS[0]?.frame ?? 0;
  eraseLayer: 'walls' | 'floor' = 'walls';
  deskOrientation: Dir = 'down';
  selection: Selection | null = null;
  version = 0;
  private readonly listeners = new Set<() => void>();
  private errorsCache: { version: number; errors: MapError[] } | null = null;

  constructor(doc: TiledDoc) {
    this.stack = new CommandStack(doc);
    this.stack.subscribe(() => {
      // Objeto selecionado pode ter sumido num desfazer.
      if (this.selection && !this.selected()) this.selection = null;
      this.changed();
    });
  }

  get doc(): TiledDoc {
    return this.stack.doc;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Erros do contrato no mapa em edição, recalculados só quando o documento muda. */
  errors(): MapError[] {
    if (this.errorsCache?.version !== this.stack.version) {
      const result = compileMap(this.doc);
      this.errorsCache = { version: this.stack.version, errors: result.ok ? [] : result.errors };
    }
    return this.errorsCache.errors;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    if (tool !== 'select') this.selection = null;
    this.changed();
  }

  setOption(patch: Partial<Pick<EditorController, 'floorFrame' | 'furnitureFrame' | 'eraseLayer' | 'deskOrientation'>>): void {
    Object.assign(this, patch);
    this.changed();
  }

  selected() {
    if (!this.selection) return undefined;
    const { layer, id } = this.selection;
    const objects = this.doc.layers.find((l) => l.name === layer && l.type === 'objectgroup');
    return objects?.type === 'objectgroup' ? objects.objects.find((o) => o.id === id) : undefined;
  }

  // ---- ações da cena ----

  /** Fim de um traço de pincel ou borracha: vira um comando só. */
  stroke(tiles: [number, number][]): void {
    const { doc } = this;
    if (this.tool === 'floor') {
      const base = firstGid(doc, 'floors');
      if (base !== null) this.stack.execute(paint(doc, 'floor', tiles, base + this.floorFrame));
    } else if (this.tool === 'wall') {
      const base = firstGid(doc, 'walls');
      if (base !== null) this.stack.execute(paint(doc, 'walls', tiles, base + WALL_FRAME));
    } else if (this.tool === 'erase') {
      this.stack.execute(paint(doc, this.eraseLayer, tiles, 0));
    }
  }

  click(tx: number, ty: number): void {
    const { doc } = this;
    switch (this.tool) {
      case 'furniture': {
        const base = firstGid(doc, 'furniture');
        if (base !== null) this.stack.execute(placeFurniture(doc, base + this.furnitureFrame, tx, ty));
        break;
      }
      case 'desk': {
        this.stack.execute(addDesk(doc, tx, ty, this.deskOrientation));
        this.selectLast('desks');
        break;
      }
      case 'spawn':
        this.stack.execute(moveSpawn(doc, tx, ty));
        break;
      case 'select':
        this.selection = this.pick(tx, ty);
        this.changed();
        break;
      default:
        break;
    }
  }

  drawZone(rect: TileRect): void {
    this.stack.execute(addZone(this.doc, rect, 'open', 'Nova zona'));
    this.selectLast('zones');
    this.tool = 'select';
    this.changed();
  }

  /** Arrastar o objeto selecionado para outro tile. */
  moveSelected(tx: number, ty: number): void {
    if (!this.selection) return;
    this.stack.execute(moveObject(this.doc, this.selection.layer, this.selection.id, tx, ty));
  }

  // ---- ações do painel ----

  removeSelected(): void {
    if (!this.selection || this.selection.layer === 'spawn') return;
    this.stack.execute(removeObject(this.doc, this.selection.layer, this.selection.id));
    this.selection = null;
    this.changed();
  }

  rotateSelected(): void {
    if (this.selection?.layer !== 'desks') return;
    this.stack.execute(rotateDesk(this.doc, this.selection.id));
  }

  setZone(values: { name?: string; type?: ZoneType }): void {
    if (this.selection?.layer !== 'zones') return;
    this.stack.execute(setZoneProps(this.doc, this.selection.id, values));
  }

  undo(): void {
    this.stack.undo();
  }

  redo(): void {
    this.stack.redo();
  }

  reset(doc: TiledDoc): void {
    this.selection = null;
    this.stack.reset(doc);
  }

  private pick(tx: number, ty: number): Selection | null {
    for (const layer of PICK_ORDER) {
      const object = objectAt(this.doc, layer, tx, ty);
      if (object) return { layer, id: object.id };
    }
    return null;
  }

  private selectLast(layer: ObjectLayerName): void {
    const objects = this.doc.layers.find((l) => l.name === layer && l.type === 'objectgroup');
    const last = objects?.type === 'objectgroup' ? objects.objects.at(-1) : undefined;
    if (last) this.selection = { layer, id: last.id };
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
