import { TILESETS, TILESET_IDS, TILE_PX, gameTableLayout, gameTableSides, isWalkable, tilesetImageUrl, type CompiledDesk } from '@pixelwork/shared';
import { propertyValue, textProp, type TiledObject } from '@pixelwork/shared/editor';
import * as Phaser from 'phaser';
import { isTyping, releaseFocus } from '../input-focus.ts';
import { drawDeskJoins } from '../game/desk-joins.ts';
import { preloadCharacterLayers } from '../game/avatar-texture.ts';
import { deskDecorFrame, deskSprites } from '../game/presence.ts';
import { drawReceptionAvatar } from '../game/reception-avatar.ts';
import { baseZoom } from '../game/scale.ts';
import { embedTilesets, resolveGid } from '../game/tiled.ts';
import type { EditorController } from './editor-controller.ts';

const sheetKey = (id: string) => `sheet:${id}`;
const tilesKey = (id: string) => `tiles:${id}`;
const DESK_TILESET = 'desk-decor';
/** Frame da variação `basic` no desk-decor: o editor desenha toda mesa com ele. */
const DESK_FRAME = Number(
  Object.entries(TILESETS[DESK_TILESET].items).find(([, item]) => item === 'basic')?.[0] ?? 0,
);
const ARROW: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
/** Velocidade da câmera pelas setas, em pixels do mundo por ms. */
const PAN_SPEED = 0.4;

/**
 * Modo de edição: desenha o documento do controlador e traduz o mouse em ações. Lógica de edição
 * não fica aqui; ela vive no controlador e nos comandos do shared, que têm teste.
 */
export class EditorScene extends Phaser.Scene {
  private content: Phaser.GameObjects.GameObject[] = [];
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private tilemapKey: string | null = null;
  private overlay!: Phaser.GameObjects.Graphics;
  private stroke: [number, number][] = [];
  private dragStart: { x: number; y: number } | null = null;
  private hover: { x: number; y: number } | null = null;
  private deskPreview: { x: number; y: number; version: number; value: ReturnType<EditorController['deskGroupPreview']> } | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly controller: EditorController) {
    super('editor');
  }

  preload(): void {
    preloadCharacterLayers(this);
    for (const id of TILESET_IDS) {
      this.load.image(tilesKey(id), tilesetImageUrl(id));
      this.load.spritesheet(sheetKey(id), tilesetImageUrl(id), {
        frameWidth: TILESETS[id].tileWidth,
        frameHeight: TILESETS[id].tileHeight,
      });
    }
  }

  create(): void {
    this.overlay = this.add.graphics().setDepth(1000);
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('teclado indisponível');
    keyboard.disableGlobalCapture();
    const keyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: keyboard.addKey(keyCodes.UP),
      down: keyboard.addKey(keyCodes.DOWN),
      left: keyboard.addKey(keyCodes.LEFT),
      right: keyboard.addKey(keyCodes.RIGHT),
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      releaseFocus();
      this.onDown(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));

    this.render();
    const doc = this.controller.doc;
    this.cameras.main.setZoom(baseZoom()).centerOn((doc.width * TILE_PX) / 2, (doc.height * TILE_PX) / 2);
    this.unsubscribe = this.controller.subscribe(() => this.render());
    const stop = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
  }

  override update(_time: number, delta: number): void {
    const camera = this.cameras.main;
    if (!isTyping()) {
      for (const [name, [dx, dy]] of Object.entries(ARROW)) {
        if (this.keys[name]?.isDown) {
          camera.scrollX += dx * delta * PAN_SPEED;
          camera.scrollY += dy * delta * PAN_SPEED;
        }
      }
    }
    this.drawOverlay();
  }

  private tileAt(pointer: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: Math.floor(pointer.worldX / TILE_PX), y: Math.floor(pointer.worldY / TILE_PX) };
  }

  /**
   * Começo do gesto, conforme a ferramenta: pincel e borracha abrem um traço, zona e tapete
   * guardam o canto do retângulo, seleção clica e prepara o arraste, o resto é clique simples.
   */
  private onDown(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    const { tool } = this.controller;
    if (tool === 'floor' || tool === 'wall' || tool === 'erase') {
      this.stroke = [[tile.x, tile.y]];
    } else if (tool === 'zone' || tool === 'rug') {
      this.dragStart = tile;
    } else if (tool === 'select') {
      this.controller.click(tile.x, tile.y);
      if (this.controller.selection) this.dragStart = tile;
    } else {
      this.controller.click(tile.x, tile.y);
      if (tool === 'desk' && this.controller.deskArrangement !== 'single' && !this.controller.deskPlacementBlocked) this.hover = null;
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    this.hover = tile;
    if (pointer.isDown && this.stroke.length > 0) {
      const lastTile = this.stroke.at(-1);
      if (lastTile?.[0] !== tile.x || lastTile[1] !== tile.y) this.stroke.push([tile.x, tile.y]);
    }
  }

  /** Fim do gesto: fecha o traço num comando ou transforma o arraste em zona, tapete ou movimento. */
  private onUp(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    if (this.stroke.length > 0) {
      this.controller.stroke(this.stroke);
      this.stroke = [];
    }
    if (this.dragStart) {
      const start = this.dragStart;
      this.dragStart = null;
      const rect = {
        x: Math.min(start.x, tile.x),
        y: Math.min(start.y, tile.y),
        width: Math.abs(tile.x - start.x) + 1,
        height: Math.abs(tile.y - start.y) + 1,
      };
      if (this.controller.tool === 'zone') {
        this.controller.drawZone(rect);
      } else if (this.controller.tool === 'rug') {
        this.controller.drawRug(rect);
      } else if (start.x !== tile.x || start.y !== tile.y) {
        const selected = this.controller.selected();
        if (selected && this.controller.selection) {
          // Arrastar pela segunda metade do móvel não deve mover a sua âncora até o mouse.
          const layer = this.controller.selection.layer;
          const origin = {
            x: Math.floor(selected.x / TILE_PX),
            y: Math.floor(selected.y / TILE_PX) - (layer === 'furniture' ? 1 : 0),
          };
          this.controller.moveSelected(origin.x + tile.x - start.x, origin.y + tile.y - start.y);
        }
      }
    }
  }

  /** Redesenha tudo a partir do documento; só acontece quando um comando muda o mapa. */
  private render(): void {
    for (const object of this.content) object.destroy();
    this.content = [];
    this.tilemap?.destroy();
    if (this.tilemapKey) this.cache.tilemap.remove(this.tilemapKey);

    const doc = this.controller.doc;
    this.tilemapKey = `editor-${this.controller.version}`;
    this.cache.tilemap.add(this.tilemapKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: embedTilesets(doc) });
    const tilemap = this.make.tilemap({ key: this.tilemapKey });
    this.tilemap = tilemap;
    const tilesets = TILESET_IDS.flatMap((id) => tilemap.addTilesetImage(id, tilesKey(id)) ?? []);
    for (const [name, depth] of [['floor', 0], ['walls', 1]] as const) {
      const layer = tilemap.createLayer(name, tilesets);
      layer.setDepth(depth);
      this.content.push(layer);
    }

    const width = doc.width * TILE_PX;
    const height = doc.height * TILE_PX;
    const grid = this.add.graphics().setDepth(2);
    grid.lineStyle(1, 0xffffff, 0.08);
    for (let x = 0; x <= width; x += TILE_PX) grid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += TILE_PX) grid.lineBetween(0, y, width, y);
    this.content.push(grid);
    this.cameras.main.setBounds(-TILE_PX * 4, -TILE_PX * 4, width + TILE_PX * 8, height + TILE_PX * 8);

    // Profundidades fixas: piso 0, paredes 1, grade 2, zonas 3, móveis e mesas 4, cadeira 5,
    // rótulos 6, spawn 7 e contorno da seleção 8; a prévia do overlay fica em 1000.
    const compiled = this.controller.compiled();
    const desks = compiled.ok ? compiled.map.desks : [];
    const desksByKey = new Map(desks.map((desk) => [desk.key, desk]));
    this.content.push(...drawDeskJoins(this, desks, 3.9));
    const selection = this.controller.selection;
    const isSelected = (layer: string, object: TiledObject) => selection?.layer === layer && selection.id === object.id;
    for (const layer of doc.layers) {
      if (layer.type !== 'objectgroup') continue;
      for (const object of layer.objects) {
        if (layer.name === 'zones') this.drawZone(object, isSelected('zones', object));
        else if (layer.name === 'furniture') this.drawFurniture(object, isSelected('furniture', object));
        else if (layer.name === 'desks') {
          this.drawDesk(object, isSelected('desks', object), desksByKey.get(textProp(object, 'desk_key')));
        }
        else if (layer.name === 'spawn') this.drawSpawn(object, isSelected('spawn', object));
        else if (layer.name === 'reception') this.drawReception(object);
      }
    }
  }

  private drawZone(zone: TiledObject, selected: boolean): void {
    const meeting = propertyValue(zone, 'type') === 'meeting';
    const color = meeting ? 0xb55088 : 0x0099db;
    const rect = this.add
      .rectangle(zone.x, zone.y, zone.width, zone.height, color, 0.15)
      .setOrigin(0)
      .setStrokeStyle(selected ? 2 : 1, selected ? 0xfee761 : color, 0.9)
      .setDepth(3);
    const label = this.text(zone.x + 2, zone.y + 2, `${textProp(zone, 'name')} · ${textProp(zone, 'zone_key')}`).setDepth(6);
    this.content.push(rect, label);
  }

  /** Móvel do Tiled tem a origem no canto inferior esquerdo, por isso o contorno sobe a altura. */
  private drawFurniture(furniture: TiledObject, selected: boolean): void {
    const tile = furniture.gid ? resolveGid(this.controller.doc, furniture.gid) : null;
    if (!tile) return;
    const image = this.add.image(furniture.x, furniture.y, sheetKey(tile.id), tile.frame).setOrigin(0, 1).setDepth(4);
    this.content.push(image);
    if (!selected) return;
    const tileset = TILESETS[tile.id];
    const width = furniture.width || tileset.tileWidth;
    const height = furniture.height || tileset.tileHeight;
    this.content.push(this.outline(furniture.x, furniture.y - height, width, height));
    const layout = gameTableLayout(tileset.items[tile.frame]);
    if (!layout) return;
    const compiled = this.controller.compiled();
    if (!compiled.ok) return;
    const { map } = compiled;
    const top = Math.ceil(furniture.y / TILE_PX) - Math.max(1, Math.round(height / TILE_PX));
    const footprint = { x: Math.floor(furniture.x / TILE_PX), y: top, width: Math.round(width / TILE_PX), height: Math.round(height / TILE_PX) };
    const spots = gameTableSides(footprint, layout.sideAxis, map.width, map.height, (x, y) => isWalkable(map, x, y));
    for (const [side, color] of [['left', 0xfb6b1d], ['right', 0x4d9be6]] as const) {
      for (const [x, y] of spots[side]) {
        const dot = this.add.circle((x + 0.5) * TILE_PX, (y + 0.5) * TILE_PX, 2.5, color, 0.95).setDepth(5);
        this.content.push(dot);
      }
    }
  }

  /** Desenha a mesa e marca a posição da cadeira. Em rascunhos inválidos usa a prévia básica. */
  private drawDesk(desk: TiledObject, selected: boolean, compiled: CompiledDesk | undefined): void {
    const width = desk.width || TILE_PX;
    const height = desk.height || TILE_PX;
    if (compiled) {
      for (const sprite of deskSprites(compiled, null)) {
        const frame = deskDecorFrame(sprite.item);
        if (!frame) continue;
        this.content.push(this.add.image(desk.x + sprite.dx, desk.y + height + sprite.dy, sheetKey(frame.tileset), frame.frame)
          .setOrigin(0, 1).setFlip(sprite.flip, sprite.flipY).setDepth(4 + sprite.z));
      }
    } else {
      const draw = (x: number, y: number) => this.add.image(x, y, sheetKey(DESK_TILESET), DESK_FRAME).setOrigin(0).setDepth(4);
      this.content.push(draw(desk.x, desk.y));
      if (width > TILE_PX) this.content.push(draw(desk.x + TILE_PX, desk.y));
      if (height > TILE_PX) this.content.push(draw(desk.x, desk.y + TILE_PX));
    }
    const orientation = textProp(desk, 'orientation', 'down');
    const [dx, dy] = ARROW[orientation] ?? [0, 1];
    // Marca da cadeira na frente do tile de âncora, encostada na borda da pegada.
    const chairX = desk.x + TILE_PX / 2 + (dx > 0 ? width : dx * TILE_PX);
    const chairY = desk.y + TILE_PX / 2 + (dy > 0 ? height : dy * TILE_PX);
    const chair = this.add.circle(chairX, chairY, 3, 0xfee761, 0.8).setDepth(5);
    const label = this.text(desk.x, desk.y - 8, textProp(desk, 'desk_key')).setDepth(6);
    this.content.push(chair, label);
    if (selected) this.content.push(this.outline(desk.x, desk.y, width, height));
  }

  /** O spawn é um ponto no centro do tile; o contorno cerca o tile inteiro. */
  private drawSpawn(spawn: TiledObject, selected: boolean): void {
    const marker = this.add.star(spawn.x, spawn.y, 5, 3, 7, 0xfeae34).setDepth(7);
    this.content.push(marker);
    if (selected) this.content.push(this.outline(spawn.x - TILE_PX / 2, spawn.y - TILE_PX / 2, TILE_PX, TILE_PX));
  }

  private drawReception(point: TiledObject): void {
    if (!point.point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    const seated = propertyValue(point, 'seated') === true;
    const { x, y, sprite, stool } = drawReceptionAvatar(
      this, Math.floor(point.x / TILE_PX), Math.floor(point.y / TILE_PX), seated, 3.99,
    );
    const label = this.text(x, y + (seated ? -31 : 1), 'Recepção').setOrigin(0.5, 0).setDepth(6);
    this.content.push(sprite, label);
    if (stool) this.content.push(stool);
  }

  private outline(x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(x, y, width, height).setOrigin(0).setStrokeStyle(2, 0xfee761).setDepth(8);
  }

  /** Prévia do traço, do retângulo da zona e do tile sob o mouse. */
  private drawOverlay(): void {
    const graphics = this.overlay;
    graphics.clear();
    if (this.hover) {
      const { x, y } = this.hover;
      const { version, tool } = this.controller;
      if (tool === 'desk' && (this.deskPreview?.version !== version || this.deskPreview.x !== x || this.deskPreview.y !== y)) {
        this.deskPreview = { x, y, version, value: this.controller.deskGroupPreview(x, y) };
      }
      const preview = tool === 'desk' ? this.deskPreview?.value : null;
      if (preview) {
        const color = preview.valid ? 0x1ebc73 : 0xe83b3b;
        for (const desk of preview.placements) {
          graphics.fillStyle(color, 0.25).fillRect(desk.x * TILE_PX, desk.y * TILE_PX, desk.width * TILE_PX, desk.height * TILE_PX);
          graphics.lineStyle(1, color, 0.9).strokeRect(desk.x * TILE_PX, desk.y * TILE_PX, desk.width * TILE_PX, desk.height * TILE_PX);
          graphics.fillStyle(color, 0.95).fillCircle((desk.chairX + 0.5) * TILE_PX, (desk.chairY + 0.5) * TILE_PX, 3);
        }
      } else {
        graphics.lineStyle(1, 0xffffff, 0.6).strokeRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      }
    }
    for (const [x, y] of this.stroke) graphics.fillStyle(0xfee761, 0.35).fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    if (this.dragStart && this.hover && (this.controller.tool === 'zone' || this.controller.tool === 'rug')) {
      const x = Math.min(this.dragStart.x, this.hover.x);
      const y = Math.min(this.dragStart.y, this.hover.y);
      const width = Math.abs(this.hover.x - this.dragStart.x) + 1;
      const height = Math.abs(this.hover.y - this.dragStart.y) + 1;
      graphics.lineStyle(1, 0xfee761, 1).strokeRect(x * TILE_PX, y * TILE_PX, width * TILE_PX, height * TILE_PX);
    }
  }

  private text(x: number, y: number, value: string): Phaser.GameObjects.Text {
    const label = this.add.text(x, y, value, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#ffffff',
      stroke: '#181425',
      strokeThickness: 2,
      resolution: 4,
    });
    // O jogo é pixelArt (filtro nearest); texto reduzido com nearest serrilha.
    label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return label;
  }
}
