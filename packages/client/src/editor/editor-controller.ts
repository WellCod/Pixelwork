import { TILESETS, TILESET_IDS, compileMap, frameOf, type Dir, type MapError, type TilesetId } from '@pixelwork/shared';
import {
  CommandStack,
  addDesk,
  addZone,
  moveObject,
  moveSpawn,
  objectAt,
  paint,
  paintRug,
  placeFurniture,
  removeObject,
  rotateDesk,
  setZoneProps,
  type ObjectLayerName,
  type RugId,
  type TileRect,
  type TiledDoc,
  type ZoneType,
} from '@pixelwork/shared/editor';

export type Tool = 'select' | 'floor' | 'wall' | 'rug' | 'erase' | 'furniture' | 'zone' | 'desk' | 'spawn';

export interface Selection {
  layer: ObjectLayerName;
  id: number;
}

/** Opções do pincel, pelo item_id do catálogo (o frame vem dele, não da posição no tileset). */
const option = (tileset: 'floors' | 'walls') => (o: { item: string; label: string }) => ({ ...o, frame: frameOf(tileset, o.item) });

export const FLOOR_OPTIONS = [
  { item: 'wood-light', label: 'Madeira clara' },
  { item: 'wood-herringbone', label: 'Taco' },
  { item: 'wood-dark', label: 'Madeira escura' },
  { item: 'tile-cream', label: 'Ladrilho creme' },
  { item: 'tile-sage', label: 'Ladrilho sálvia' },
  { item: 'kitchen-checker', label: 'Copa (xadrez)' },
  { item: 'carpet-gray', label: 'Carpete cinza' },
  { item: 'carpet-lilac', label: 'Carpete lavanda' },
  { item: 'carpet-ice', label: 'Carpete azul' },
  { item: 'concrete', label: 'Cimento' },
  { item: 'stone-path', label: 'Calçada' },
  { item: 'grass', label: 'Grama' },
].map(option('floors'));

/** Tiles do pincel de parede: faces lisas, janelas e decoração (tudo colide, como parede). */
export const WALL_OPTIONS = [
  { item: 'wall', label: 'Parede clara' },
  { item: 'wall-sage', label: 'Parede sálvia' },
  { item: 'wall-cream', label: 'Parede creme' },
  { item: 'wall-lilac', label: 'Parede lilás' },
  { item: 'wall-top', label: 'Topo da parede' },
  { item: 'wall-window', label: 'Janela' },
  { item: 'wall-window-curtain', label: 'Janela com cortina' },
  { item: 'wall-painting', label: 'Quadro' },
  { item: 'wall-poster', label: 'Pôster' },
  { item: 'wall-clock', label: 'Relógio' },
  { item: 'wall-whiteboard', label: 'Lousa' },
  { item: 'wall-shelf', label: 'Prateleira' },
  { item: 'wall-corkboard', label: 'Mural de cortiça' },
  { item: 'wall-plant', label: 'Planta pendurada' },
  { item: 'wall-tv', label: 'TV' },
].map(option('walls'));

export const RUG_OPTIONS: { rug: RugId; label: string }[] = [
  { rug: 'lavender', label: 'Tapete lavanda' },
  { rug: 'sage', label: 'Tapete sálvia' },
  { rug: 'cream', label: 'Tapete creme' },
];


/** Ordem de clique na ferramenta de seleção: o que fica por cima primeiro. */
const PICK_ORDER: ObjectLayerName[] = ['spawn', 'desks', 'furniture', 'zones'];

function firstGid(doc: TiledDoc, id: TilesetId): number | null {
  const refs = doc.tilesets as { firstgid: number; source: string }[] | undefined;
  return refs?.find((t) => t.source === `${id}.tsj`)?.firstgid ?? null;
}

/** Tilesets de móveis colocáveis: o `furniture` (16x16) e os de várias células. */
export const FURNITURE_TILESETS = TILESET_IDS.filter((id) => id.startsWith('furniture'));

export const FURNITURE_OPTIONS = FURNITURE_TILESETS.flatMap((tileset) =>
  Object.entries(TILESETS[tileset].items).map(([frame, item]) => ({ tileset, frame: Number(frame), item })),
);

export type FurnitureChoice = { tileset: TilesetId; frame: number };

/**
 * Estado do editor fora do Phaser: pilha de comandos, ferramenta, opções e seleção. A cena só
 * desenha e traduz o mouse em chamadas daqui; o painel em React lê e muda o mesmo estado.
 */
export class EditorController {
  readonly stack: CommandStack;
  tool: Tool = 'select';
  floorFrame: number = FLOOR_OPTIONS[0]?.frame ?? 0;
  wallFrame: number = WALL_OPTIONS[0]?.frame ?? 0;
  rug: RugId = 'lavender';
  furniture: FurnitureChoice = FURNITURE_OPTIONS[0] ?? { tileset: 'furniture', frame: 0 };
  eraseLayer: 'walls' | 'floor' = 'walls';
  deskOrientation: Dir = 'down';
  selection: Selection | null = null;
  version = 0;
  private readonly listeners = new Set<() => void>();
  private errorsCache: { version: number; errors: MapError[] } | null = null;

  /** Documento salvo de referência, para saber se há edição a perder ao sair. */
  private baseline: string;

  constructor(doc: TiledDoc) {
    this.stack = new CommandStack(doc);
    this.baseline = JSON.stringify(doc);
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

  setOption(
    patch: Partial<Pick<EditorController, 'floorFrame' | 'wallFrame' | 'rug' | 'furniture' | 'eraseLayer' | 'deskOrientation'>>,
  ): void {
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
      if (base !== null) this.stack.execute(paint(doc, 'walls', tiles, base + this.wallFrame));
    } else if (this.tool === 'erase') {
      this.stack.execute(paint(doc, this.eraseLayer, tiles, 0));
    }
  }

  click(tx: number, ty: number): void {
    const { doc } = this;
    switch (this.tool) {
      case 'furniture': {
        this.stack.execute(placeFurniture(doc, this.furniture.tileset, this.furniture.frame, tx, ty));
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

  /** Fim do arrasto da ferramenta de tapete: pinta o retângulo com o tapete escolhido. */
  drawRug(rect: TileRect): void {
    this.stack.execute(paintRug(this.doc, this.rug, rect.x, rect.y, rect.x + rect.w - 1, rect.y + rect.h - 1));
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

  /** O documento atual passa a ser o salvo (depois de recarregar o mapa do servidor). */
  markClean(): void {
    this.baseline = JSON.stringify(this.doc);
  }

  get dirty(): boolean {
    return JSON.stringify(this.doc) !== this.baseline;
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
