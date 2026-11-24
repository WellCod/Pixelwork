import { TILESETS, TILESET_IDS, compileMap, frameOf, type CompileResult, type Dir, type MapError, type TilesetId } from '@pixelwork/shared';
import {
  CommandStack,
  addDesk,
  addDeskGroup,
  canPlaceDeskGroup,
  deskGroupLayout,
  addZone,
  gameTableOf,
  moveObject,
  moveSpawn,
  objectAt,
  paint,
  paintRug,
  placeFurniture,
  removeObject,
  rotateDesk,
  rotateGameTable,
  setZoneProps,
  type DeskArrangement,
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
const option = (tileset: 'floors' | 'walls') => (entry: { item: string; label: string }) => ({
  ...entry,
  frame: frameOf(tileset, entry.item),
});

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
  { item: 'wall-divider', label: 'Divisória vertical' },
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

/** firstgid do tileset no documento: o gid gravado no mapa é firstgid + frame. */
function firstGid(doc: TiledDoc, id: TilesetId): number | null {
  const references = doc.tilesets as { firstgid: number; source: string }[] | undefined;
  return references?.find((reference) => reference.source === `${id}.tsj`)?.firstgid ?? null;
}

/** Tilesets de móveis colocáveis: o `furniture` (16x16) e os de várias células. */
export const FURNITURE_TILESETS = TILESET_IDS.filter((id) => id.startsWith('furniture') && id !== 'furniture-2x3');

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
  deskArrangement: DeskArrangement = 'single';
  deskCount = 3;
  deskPlacementBlocked = false;
  selection: Selection | null = null;
  version = 0;
  private readonly listeners = new Set<() => void>();
  private compiledCache: { version: number; result: CompileResult } | null = null;

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

  /** Recompila somente quando o documento muda. */
  compiled(): CompileResult {
    if (this.compiledCache?.version !== this.stack.version) {
      this.compiledCache = { version: this.stack.version, result: compileMap(this.doc) };
    }
    return this.compiledCache.result;
  }

  errors(): MapError[] {
    const result = this.compiled();
    return result.ok ? [] : result.errors;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.deskPlacementBlocked = false;
    if (tool !== 'select') this.selection = null;
    this.changed();
  }

  setOption(
    patch: Partial<Pick<EditorController, 'floorFrame' | 'wallFrame' | 'rug' | 'furniture' | 'eraseLayer' | 'deskOrientation' | 'deskArrangement' | 'deskCount'>>,
  ): void {
    Object.assign(this, patch);
    this.deskPlacementBlocked = false;
    this.changed();
  }

  /** Objeto do documento apontado pela seleção, ou undefined se ela ficou órfã. */
  selected() {
    if (!this.selection) return undefined;
    const { layer, id } = this.selection;
    const objectLayer = this.doc.layers.find((candidate) => candidate.name === layer && candidate.type === 'objectgroup');
    return objectLayer?.type === 'objectgroup' ? objectLayer.objects.find((object) => object.id === id) : undefined;
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

  /** Clique num tile com a ferramenta atual: põe móvel, mesa ou spawn, ou seleciona. */
  click(tx: number, ty: number): void {
    const { doc } = this;
    switch (this.tool) {
      case 'furniture': {
        this.stack.execute(placeFurniture(doc, this.furniture.tileset, this.furniture.frame, tx, ty));
        break;
      }
      case 'desk': {
        const command = this.deskArrangement === 'single'
          ? addDesk(doc, tx, ty, this.deskOrientation)
          : addDeskGroup(doc, tx, ty, this.deskOrientation, this.deskArrangement, this.deskCount);
        this.deskPlacementBlocked = !command;
        if (command) {
          if (this.deskArrangement !== 'single') this.selection = null;
          this.stack.execute(command);
          if (this.deskArrangement === 'single') this.selectLast('desks');
        } else {
          this.changed();
        }
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

  /** Prévia da bancada no tile sob o cursor, com validade para a área e as cadeiras. */
  deskGroupPreview(x: number, y: number) {
    if (this.deskArrangement === 'single') return null;
    const placements = deskGroupLayout(x, y, this.deskOrientation, this.deskArrangement, this.deskCount);
    const result = this.compiled();
    return { placements, valid: result.ok && canPlaceDeskGroup(result.map, placements) };
  }

  /** Fim do arrasto da ferramenta de tapete: pinta o retângulo com o tapete escolhido. */
  drawRug(rect: TileRect): void {
    this.stack.execute(paintRug(this.doc, this.rug, rect.x, rect.y, rect.x + rect.width - 1, rect.y + rect.height - 1));
  }

  /** Fim do arrasto da ferramenta de zona: cria a zona, seleciona e volta para a seleção. */
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

  selectedGameTable(): ReturnType<typeof gameTableOf> {
    const object = this.selection?.layer === 'furniture' ? this.selected() : undefined;
    return object ? gameTableOf(this.doc, object) : undefined;
  }

  rotateSelected(): void {
    const selection = this.selection;
    if (selection?.layer === 'desks') this.stack.execute(rotateDesk(this.doc, selection.id));
    if (selection?.layer === 'furniture') this.stack.execute(rotateGameTable(this.doc, selection.id));
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

  /** Objeto sob o tile, procurando as camadas de cima para baixo (PICK_ORDER). */
  private pick(tx: number, ty: number): Selection | null {
    for (const layer of PICK_ORDER) {
      const object = objectAt(this.doc, layer, tx, ty);
      if (object) return { layer, id: object.id };
    }
    return null;
  }

  /** Seleciona o objeto recém-criado, que o comando acrescenta no fim da camada. */
  private selectLast(layer: ObjectLayerName): void {
    const objectLayer = this.doc.layers.find((candidate) => candidate.name === layer && candidate.type === 'objectgroup');
    const last = objectLayer?.type === 'objectgroup' ? objectLayer.objects.at(-1) : undefined;
    if (last) this.selection = { layer, id: last.id };
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
