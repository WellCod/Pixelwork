import {
  STEP_MS,
  TILESET_IDS,
  TILE_PX,
  tilesetImageUrl,
  type ClientMsg,
  type Dir,
  type Player,
} from '@pixelwork/shared';
import * as Phaser from 'phaser';
import type { ClientWorld, WorldEvent } from '../net/client-world.ts';
import { ensureAvatarTexture, idleFrame, preloadCharacterLayers, walkAnim } from './avatar-texture.ts';
import { Mover } from './mover.ts';
import { embedTilesets, objectLayer, prop, resolveGid } from './tiled.ts';

export interface WorldSceneOptions {
  world: ClientWorld;
  mapJson: Record<string, unknown>;
  send: (msg: ClientMsg) => void;
}

interface Avatar {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  mover: Mover;
  textureKey: string;
  dir: Dir;
}

const DESK_TILESET = 'desk-decor';
const DESK_FRAME = 0;
const MONITOR_FRAME = 1;
const LABEL_DEPTH = 100_000;

const sheetKey = (id: string) => `sheet:${id}`;
const tilesKey = (id: string) => `tiles:${id}`;

export class WorldScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Avatar>();
  private keys!: Record<Dir, Phaser.Input.Keyboard.Key[]>;
  private lastStepAt = -Infinity;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: WorldSceneOptions) {
    super('world');
  }

  preload(): void {
    for (const id of TILESET_IDS) {
      this.load.image(tilesKey(id), tilesetImageUrl(id));
      this.load.spritesheet(sheetKey(id), tilesetImageUrl(id), { frameWidth: TILE_PX, frameHeight: TILE_PX });
    }
    preloadCharacterLayers(this);
  }

  create(): void {
    const { mapJson } = this.options;
    this.cache.tilemap.add('office', { format: Phaser.Tilemaps.Formats.TILED_JSON, data: embedTilesets(mapJson) });
    const tilemap = this.make.tilemap({ key: 'office' });
    const tilesets = TILESET_IDS.flatMap((id) => tilemap.addTilesetImage(id, tilesKey(id)) ?? []);
    tilemap.createLayer('floor', tilesets).setDepth(-2);
    tilemap.createLayer('walls', tilesets).setDepth(-1);

    for (const object of objectLayer(mapJson, 'furniture')) {
      const tile = object.gid ? resolveGid(mapJson, object.gid) : null;
      if (!tile) continue;
      this.add
        .image(object.x, object.y, sheetKey(tile.id), tile.frame)
        .setOrigin(0, 1)
        .setDepth(object.y);
    }
    for (const object of objectLayer(mapJson, 'desks')) {
      const bottom = object.y + TILE_PX;
      this.add.image(object.x, bottom, sheetKey(DESK_TILESET), DESK_FRAME).setOrigin(0, 1).setDepth(bottom);
      this.add.image(object.x, bottom, sheetKey(DESK_TILESET), MONITOR_FRAME).setOrigin(0, 1).setDepth(bottom + 0.1);
    }
    for (const object of objectLayer(mapJson, 'zones')) {
      const name = prop(object, 'name');
      if (typeof name !== 'string' || name === '') continue;
      this.text(object.x + 3, object.y + 2, name, '#c0cbdc').setAlpha(0.8).setDepth(LABEL_DEPTH - 1);
    }

    const width = tilemap.widthInPixels;
    const height = tilemap.heightInPixels;
    this.cameras.main.setBounds(0, 0, width, height).setRoundPixels(true);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('teclado indisponível');
    const k = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [keyboard.addKey(k.UP), keyboard.addKey(k.W)],
      down: [keyboard.addKey(k.DOWN), keyboard.addKey(k.S)],
      left: [keyboard.addKey(k.LEFT), keyboard.addKey(k.A)],
      right: [keyboard.addKey(k.RIGHT), keyboard.addKey(k.D)],
    };

    // Toque rápido (soltar antes do próximo frame) também anda um tile.
    for (const [dir, keys] of Object.entries(this.keys) as [Dir, Phaser.Input.Keyboard.Key[]][]) {
      for (const key of keys) key.on('down', () => this.tryStep(dir));
    }

    this.rebuild();
    this.unsubscribe = this.options.world.subscribe((event) => {
      this.onWorldEvent(event);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubscribe?.());
  }

  override update(_time: number, delta: number): void {
    const { world } = this.options;
    const held = (['up', 'down', 'left', 'right'] as const).find((dir) => this.keys[dir].some((key) => key.isDown));
    if (held) this.tryStep(held);

    for (const [id, avatar] of this.avatars) {
      avatar.mover.update(delta);
      const x = avatar.mover.x * TILE_PX + TILE_PX / 2;
      const y = avatar.mover.y * TILE_PX + TILE_PX;
      avatar.sprite.setPosition(x, y).setDepth(y);
      avatar.label.setPosition(Math.round(x), Math.round(y) + 1);
      const walking = avatar.mover.moving || (id === world.selfId && held !== undefined);
      if (walking) avatar.sprite.play(walkAnim(avatar.textureKey, avatar.dir), true);
      else avatar.sprite.stop().setFrame(idleFrame(avatar.dir));
    }
  }

  private tryStep(dir: Dir): void {
    const time = performance.now();
    const { world } = this.options;
    if (!world.selfId || time - this.lastStepAt < STEP_MS) return;
    this.lastStepAt = time;
    this.options.send(world.move(dir));
  }

  private onWorldEvent(event: WorldEvent): void {
    const { world } = this.options;
    switch (event.type) {
      case 'reset':
        this.rebuild();
        break;
      case 'join':
        this.addAvatar(event.player);
        break;
      case 'leave':
        this.removeAvatar(event.id);
        break;
      case 'remoteMove': {
        const avatar = this.avatars.get(event.id);
        if (!avatar) break;
        avatar.dir = event.dir;
        avatar.mover.push(event.x, event.y);
        break;
      }
      case 'selfStep':
      case 'selfCorrected': {
        const avatar = world.selfId ? this.avatars.get(world.selfId) : undefined;
        if (!avatar) break;
        avatar.dir = event.pos.dir;
        if (event.type === 'selfCorrected') avatar.mover.snap(event.pos.x, event.pos.y);
        else avatar.mover.push(event.pos.x, event.pos.y);
        break;
      }
    }
  }

  private rebuild(): void {
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
    const { world } = this.options;
    for (const player of world.players.values()) this.addAvatar(player);
  }

  private addAvatar(player: Player): void {
    this.removeAvatar(player.id);
    const { world } = this.options;
    const isSelf = player.id === world.selfId;
    const pos = isSelf ? world.self : player;
    const textureKey = ensureAvatarTexture(this, player.avatar);
    const sprite = this.add.sprite(0, 0, textureKey, idleFrame(pos.dir)).setOrigin(0.5, 1);
    const label = this.text(0, 0, player.name, isSelf ? '#fee761' : '#ffffff').setOrigin(0.5, 0).setDepth(LABEL_DEPTH);
    this.avatars.set(player.id, { sprite, label, mover: new Mover(pos.x, pos.y), textureKey, dir: pos.dir });
    if (isSelf) this.cameras.main.startFollow(sprite, true);
  }

  private removeAvatar(id: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    avatar.sprite.destroy();
    avatar.label.destroy();
    this.avatars.delete(id);
  }

  private text(x: number, y: number, value: string, color: string): Phaser.GameObjects.Text {
    return this.add
      .text(x, y, value, {
        fontFamily: 'monospace',
        fontSize: '8px',
        color,
        stroke: '#181425',
        strokeThickness: 2,
        resolution: 4,
      })
      .setOrigin(0, 0);
  }
}
