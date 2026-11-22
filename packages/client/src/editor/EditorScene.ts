import { TILESETS, TILESET_IDS, TILE_PX, tilesetImageUrl } from '@pixelwork/shared';
import { prop, textProp, type TiledObject } from '@pixelwork/shared/editor';
import * as Phaser from 'phaser';
import { isTyping, releaseFocus } from '../input-focus.ts';
import { embedTilesets, resolveGid } from '../game/tiled.ts';
import type { EditorController } from './editor-controller.ts';

const sheetKey = (id: string) => `sheet:${id}`;
const tilesKey = (id: string) => `tiles:${id}`;
const DESK_TILESET = 'desk-decor';
const DESK_FRAME = Number(
  Object.entries(TILESETS[DESK_TILESET].items).find(([, item]) => item === 'basic')?.[0] ?? 0,
);
const ARROW: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
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
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly controller: EditorController) {
    super('editor');
  }

  preload(): void {
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
    const k = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: keyboard.addKey(k.UP),
      down: keyboard.addKey(k.DOWN),
      left: keyboard.addKey(k.LEFT),
      right: keyboard.addKey(k.RIGHT),
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      releaseFocus();
      this.onDown(pointer);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onMove(pointer));
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.onUp(pointer));

    this.render();
    const doc = this.controller.doc;
    this.cameras.main.centerOn((doc.width * TILE_PX) / 2, (doc.height * TILE_PX) / 2);
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

  private onDown(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    const { tool } = this.controller;
    if (tool === 'floor' || tool === 'wall' || tool === 'erase') {
      this.stroke = [[tile.x, tile.y]];
    } else if (tool === 'zone') {
      this.dragStart = tile;
    } else if (tool === 'select') {
      this.controller.click(tile.x, tile.y);
      if (this.controller.selection) this.dragStart = tile;
    } else {
      this.controller.click(tile.x, tile.y);
    }
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    this.hover = tile;
    if (pointer.isDown && this.stroke.length > 0) {
      const last = this.stroke.at(-1);
      if (last?.[0] !== tile.x || last[1] !== tile.y) this.stroke.push([tile.x, tile.y]);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    const tile = this.tileAt(pointer);
    if (this.stroke.length > 0) {
      this.controller.stroke(this.stroke);
      this.stroke = [];
    }
    if (this.dragStart) {
      const start = this.dragStart;
      this.dragStart = null;
      if (this.controller.tool === 'zone') {
        this.controller.drawZone({
          x: Math.min(start.x, tile.x),
          y: Math.min(start.y, tile.y),
          w: Math.abs(tile.x - start.x) + 1,
          h: Math.abs(tile.y - start.y) + 1,
        });
      } else if (start.x !== tile.x || start.y !== tile.y) {
        const selected = this.controller.selected();
        if (selected && this.controller.selection) {
          // Zona move pelo canto: o deslocamento do arraste vale para o canto superior esquerdo.
          const origin =
            this.controller.selection.layer === 'zones'
              ? { x: selected.x / TILE_PX, y: selected.y / TILE_PX }
              : start;
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

    const selection = this.controller.selection;
    const isSelected = (layer: string, o: TiledObject) => selection?.layer === layer && selection.id === o.id;
    for (const layer of doc.layers) {
      if (layer.type !== 'objectgroup') continue;
      for (const o of layer.objects) {
        if (layer.name === 'zones') this.drawZone(o, isSelected('zones', o));
        else if (layer.name === 'furniture') this.drawFurniture(o, isSelected('furniture', o));
        else if (layer.name === 'desks') this.drawDesk(o, isSelected('desks', o));
        else if (layer.name === 'spawn') this.drawSpawn(o, isSelected('spawn', o));
      }
    }
  }

  private drawZone(o: TiledObject, selected: boolean): void {
    const meeting = prop(o, 'type') === 'meeting';
    const color = meeting ? 0xb55088 : 0x0099db;
    const rect = this.add
      .rectangle(o.x, o.y, o.width, o.height, color, 0.15)
      .setOrigin(0)
      .setStrokeStyle(selected ? 2 : 1, selected ? 0xfee761 : color, 0.9)
      .setDepth(3);
    const label = this.text(o.x + 2, o.y + 2, `${textProp(o, 'name')} · ${textProp(o, 'zone_key')}`).setDepth(6);
    this.content.push(rect, label);
  }

  private drawFurniture(o: TiledObject, selected: boolean): void {
    const tile = o.gid ? resolveGid(this.controller.doc, o.gid) : null;
    if (!tile) return;
    const image = this.add.image(o.x, o.y, sheetKey(tile.id), tile.frame).setOrigin(0, 1).setDepth(4);
    this.content.push(image);
    const w = o.width || TILE_PX;
    const h = o.height || TILE_PX;
    if (selected) this.content.push(this.outline(o.x, o.y - h, w, h));
  }

  private drawDesk(o: TiledObject, selected: boolean): void {
    const w = o.width || TILE_PX;
    const h = o.height || TILE_PX;
    const image = this.add.image(o.x, o.y, sheetKey(DESK_TILESET), DESK_FRAME).setOrigin(0).setDepth(4);
    if (w > TILE_PX) this.content.push(this.add.image(o.x + TILE_PX, o.y, sheetKey(DESK_TILESET), DESK_FRAME).setOrigin(0).setDepth(4));
    if (h > TILE_PX) this.content.push(this.add.image(o.x, o.y + TILE_PX, sheetKey(DESK_TILESET), DESK_FRAME).setOrigin(0).setDepth(4));
    const orientation = textProp(o, 'orientation', 'down');
    const [dx, dy] = ARROW[orientation] ?? [0, 1];
    // Marca da cadeira na frente do tile de âncora, encostada na borda da pegada.
    const cx = o.x + TILE_PX / 2 + (dx > 0 ? w : dx * TILE_PX);
    const cy = o.y + TILE_PX / 2 + (dy > 0 ? h : dy * TILE_PX);
    const chair = this.add.circle(cx, cy, 3, 0xfee761, 0.8).setDepth(5);
    const label = this.text(o.x, o.y - 8, textProp(o, 'desk_key')).setDepth(6);
    this.content.push(image, chair, label);
    if (selected) this.content.push(this.outline(o.x, o.y, w, h));
  }

  private drawSpawn(o: TiledObject, selected: boolean): void {
    const marker = this.add.star(o.x, o.y, 5, 3, 7, 0xfeae34).setDepth(7);
    this.content.push(marker);
    if (selected) this.content.push(this.outline(o.x - TILE_PX / 2, o.y - TILE_PX / 2, TILE_PX, TILE_PX));
  }

  private outline(x: number, y: number, w: number, h: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(x, y, w, h).setOrigin(0).setStrokeStyle(2, 0xfee761).setDepth(8);
  }

  /** Prévia do traço, do retângulo da zona e do tile sob o mouse. */
  private drawOverlay(): void {
    const g = this.overlay;
    g.clear();
    if (this.hover) {
      g.lineStyle(1, 0xffffff, 0.6).strokeRect(this.hover.x * TILE_PX, this.hover.y * TILE_PX, TILE_PX, TILE_PX);
    }
    for (const [x, y] of this.stroke) g.fillStyle(0xfee761, 0.35).fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
    if (this.dragStart && this.hover && this.controller.tool === 'zone') {
      const x = Math.min(this.dragStart.x, this.hover.x);
      const y = Math.min(this.dragStart.y, this.hover.y);
      const w = Math.abs(this.hover.x - this.dragStart.x) + 1;
      const h = Math.abs(this.hover.y - this.dragStart.y) + 1;
      g.lineStyle(1, 0xfee761, 1).strokeRect(x * TILE_PX, y * TILE_PX, w * TILE_PX, h * TILE_PX);
    }
  }

  private text(x: number, y: number, value: string): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, {
      fontFamily: 'monospace',
      fontSize: '7px',
      color: '#ffffff',
      stroke: '#181425',
      strokeThickness: 2,
      resolution: 4,
    });
  }
}
