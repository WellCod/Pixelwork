import {
  CHAT_BUBBLE_MS,
  findPath,
  RENDER_SCALE,
  STEP_MS,
  TILESETS,
  TILESET_IDS,
  TILE_PX,
  tilesetImageUrl,
  type ClientMsg,
  type CompiledDesk,
  type Dir,
  type Player,
} from '@pixelwork/shared';
import * as Phaser from 'phaser';
import type { ClientWorld, WorldEvent } from '../net/client-world.ts';
import { idleFrame, seatedFrame } from './avatar-compose.ts';
import { ensureAvatarTexture, preloadCharacterLayers, walkAnim } from './avatar-texture.ts';
import { LABEL_FONT, NamePill, TitlePill, chatBubble, deskPlaque, zonePill } from './labels.ts';
import { Mover } from './mover.ts';
import { SLOT_OFFSET, SLOT_OFFSET_WIDE, dividerLayout, isNear, seatedFacing, type Slot } from './presence.ts';
import { embedTilesets, objectLayer, prop, resolveGid } from './tiled.ts';
import { isTyping, releaseFocus } from '../input-focus.ts';

export interface WorldSceneOptions {
  world: ClientWorld;
  mapJson: Record<string, unknown>;
  send: (msg: ClientMsg) => void;
  /** Fora do ar a predição andaria sozinha e voltaria no welcome: o input fica parado. */
  canMove?: () => boolean;
  /** Quem está falando agora (LiveKit), para o anel sob o avatar. */
  isSpeaking?: (id: string) => boolean;
  /** Overlay de netcode aberto: desenha o fantasma da posição confirmada pelo servidor. */
  showGhost?: () => boolean;
  /** Começou ou parou de seguir alguém (o React mostra o card com "Parar"). */
  onFollowChange?: (id: string | null) => void;
  /** Se o avatar tem balão de vídeo em HTML por cima; o chat sobe para não ficar atrás dele. */
  hasVideoBubble?: (id: string) => boolean;
}

/** Base do balão de chat acima do pé do avatar, sem e com o balão de vídeo (76 px de tela, 2x). */
const CHAT_OFFSET = 34;
const CHAT_OFFSET_OVER_VIDEO = CHAT_OFFSET + 40;

interface Avatar {
  sprite: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Ellipse;
  shadow: Phaser.GameObjects.Ellipse;
  label: NamePill;
  title: TitlePill;
  mover: Mover;
  textureKey: string;
  dir: Dir;
  hovered: boolean;
  chat: Phaser.GameObjects.Container | null;
  chatTimer: Phaser.Time.TimerEvent | null;
}

const DESK_TILESET = 'desk-decor';
/** Sombra de contato de móveis e avatares: a cor mais escura da paleta, translúcida. */
const SHADOW_COLOR = 0x2e222f;
const SHADOW_ALPHA = 0.18;
/** Zoom da câmera sobre a escala base (RENDER_SCALE): inteiro, para o pixel art não borrar. */
const ZOOM_LEVELS = [1, 2, 3] as const;
const SPEAKING_COLOR = 0x63c74d;
const LABEL_DEPTH = 100_000;
const SLOTS: Slot[] = ['back', 'left', 'right', 'floor'];

const sheetKey = (id: string) => `sheet:${id}`;
const tilesKey = (id: string) => `tiles:${id}`;

/** item_id do catálogo -> frame no tileset de decoração de mesa. */
const DECOR_FRAMES = new Map(
  Object.entries(TILESETS[DESK_TILESET].items).map(([frame, item]) => [item, Number(frame)]),
);

export class WorldScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Avatar>();
  private readonly deskObjects = new Map<string, Phaser.GameObjects.GameObject[]>();
  private keys!: Record<Dir, Phaser.Input.Keyboard.Key[]>;
  private lastStepAt = -Infinity;
  private unsubscribe: (() => void) | null = null;
  private zoomIndex = 0;
  private ghost: Phaser.GameObjects.Rectangle | null = null;
  /** Clicar para andar: passos que faltam até o tile clicado. */
  private route: Dir[] = [];
  /** Seguindo alguém: o caminho é recalculado a cada passo até a posição atual da pessoa. */
  private following: string | null = null;
  private mapSize = { width: 0, height: 0 };

  constructor(private readonly options: WorldSceneOptions) {
    super('world');
  }

  preload(): void {
    for (const id of TILESET_IDS) {
      this.load.image(tilesKey(id), tilesetImageUrl(id));
      this.load.spritesheet(sheetKey(id), tilesetImageUrl(id), {
        frameWidth: TILESETS[id].tileWidth,
        frameHeight: TILESETS[id].tileHeight,
      });
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

    // Sombra de contato sob cada móvel (docs/art.md, guia de estilo): elipse translúcida na base
    // da pegada, desenhada abaixo dos móveis e acima do piso.
    const shadows = this.add.graphics().setDepth(-0.5);
    shadows.fillStyle(SHADOW_COLOR, SHADOW_ALPHA);
    for (const object of objectLayer(mapJson, 'furniture')) {
      const tile = object.gid ? resolveGid(mapJson, object.gid) : null;
      if (!tile) continue;
      const w = object.width ?? TILE_PX;
      if (TILESETS[tile.id].collides.includes(tile.frame)) shadows.fillEllipse(object.x + w / 2, object.y - 2, w - 2, 6);
      this.add.image(object.x, object.y, sheetKey(tile.id), tile.frame).setOrigin(0, 1).setDepth(object.y);
    }
    this.renderZoneLabels();

    this.mapSize = { width: tilemap.widthInPixels, height: tilemap.heightInPixels };
    this.cameras.main.setRoundPixels(true);
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());

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
      for (const key of keys) {
        key.on('down', () => {
          if (isTyping()) return;
          this.cancelAuto();
          this.tryStep(dir);
        });
      }
    }
    keyboard.on('keydown', (event: KeyboardEvent) => {
      if (isTyping()) return;
      if (event.key === '+' || event.key === '=') this.zoom(1);
      if (event.key === '-') this.zoom(-1);
    });
    // Campos de texto da UI em React precisam das teclas de seta e WASD.
    keyboard.disableGlobalCapture();

    this.ghost = this.add
      .rectangle(0, 0, TILE_PX, TILE_PX)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x2ce8f5, 0.9)
      .setFillStyle(0x2ce8f5, 0.15)
      .setDepth(LABEL_DEPTH - 3)
      .setVisible(false);
    this.rebuild();
    // A Inter chega por CSS; quando carrega, os rótulos são refeitos com ela (antes saem na fonte reserva).
    if (!document.fonts.check(`7px ${LABEL_FONT}`)) {
      void document.fonts.load(`600 7px ${LABEL_FONT}`).then(() => {
        if (!this.sys.isActive()) return;
        this.renderZoneLabels();
        this.rebuild();
      });
    }
    this.unsubscribe = this.options.world.subscribe((event) => {
      this.onWorldEvent(event);
    });
    // `game.destroy` emite DESTROY sem SHUTDOWN; sem os dois, a cena morta segue recebendo eventos.
    const stop = () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      releaseFocus();
      this.onPointerDown(pointer, over);
    });
  }

  override update(_time: number, delta: number): void {
    const { world } = this.options;
    const typing = isTyping();
    const held = typing
      ? undefined
      : (['up', 'down', 'left', 'right'] as const).find((dir) => this.keys[dir].some((key) => key.isDown));
    if (held) {
      this.cancelAuto();
      this.tryStep(held);
    } else {
      this.autoStep();
    }

    const self = world.selfId ? this.avatars.get(world.selfId) : undefined;
    const ghostOn = this.options.showGhost?.() ?? false;
    this.ghost?.setVisible(ghostOn && world.selfId !== null);
    if (ghostOn) this.ghost?.setPosition(world.confirmed.x * TILE_PX, world.confirmed.y * TILE_PX);
    for (const [id, avatar] of this.avatars) {
      avatar.mover.update(delta);
      const x = avatar.mover.x * TILE_PX + TILE_PX / 2;
      const y = avatar.mover.y * TILE_PX + TILE_PX;
      avatar.sprite.setPosition(x, y).setDepth(y);
      avatar.shadow.setPosition(x, y - 1).setDepth(y - 0.6);
      avatar.ring.setPosition(x, y - 1).setDepth(y - 0.5).setVisible(this.options.isSpeaking?.(id) ?? false);
      avatar.label.setPosition(Math.round(x), Math.round(y) + 1);
      avatar.title.setPosition(Math.round(x), Math.round(y) + 13);
      if (avatar.chat) {
        const offset = this.options.hasVideoBubble?.(id) ? CHAT_OFFSET_OVER_VIDEO : CHAT_OFFSET;
        avatar.chat.setPosition(Math.round(x), Math.round(y) - offset);
      }

      const near = self !== undefined && isNear(self.mover.x, self.mover.y, avatar.mover.x, avatar.mover.y);
      avatar.title.setVisible(avatar.title.value !== '' && (near || avatar.hovered));

      const walking = avatar.mover.moving || (id === world.selfId && held !== undefined);
      const seated = walking
        ? null
        : seatedFacing(world.map, world.desks, id, Math.round(avatar.mover.x), Math.round(avatar.mover.y));
      if (walking) avatar.sprite.play(walkAnim(avatar.textureKey, avatar.dir), true);
      else avatar.sprite.stop().setFrame(seated ? seatedFrame(seated) : idleFrame(avatar.dir));
    }
  }

  /** Manda um passo se o intervalo e a conexão deixarem; devolve se mandou. */
  private tryStep(dir: Dir): boolean {
    if (isTyping()) return false;
    const time = performance.now();
    const { world } = this.options;
    if (!world.selfId || time - this.lastStepAt < STEP_MS) return false;
    if (this.options.canMove && !this.options.canMove()) return false;
    this.lastStepAt = time;
    this.options.send(world.move(dir));
    return true;
  }

  /** Clique no chão anda até lá; clique num avatar passa a seguir a pessoa. */
  private onPointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void {
    const { world } = this.options;
    if (!world.selfId) return;
    const clicked = over.map((o) => o.getData('id') as string | undefined).find((id) => id && id !== world.selfId);
    if (clicked) {
      this.route = [];
      this.setFollowing(clicked);
      return;
    }
    const tx = Math.floor(pointer.worldX / TILE_PX);
    const ty = Math.floor(pointer.worldY / TILE_PX);
    const path = findPath(world.map, world.self, { x: tx, y: ty }, { canEnter: world.canEnter });
    this.setFollowing(null);
    this.route = path ?? [];
  }

  private autoStep(): void {
    const { world } = this.options;
    if (this.following) {
      const target = world.players.get(this.following);
      if (!target) {
        this.setFollowing(null);
        return;
      }
      const path = findPath(world.map, world.self, target, { canEnter: world.canEnter, stopAt: 1 });
      if (path === null) this.setFollowing(null);
      else if (path[0]) this.tryStep(path[0]);
      return;
    }
    const dir = this.route[0];
    if (!dir) return;
    const before = world.self;
    if (!this.tryStep(dir)) return;
    this.route.shift();
    // A predição não andou (alguém trancou a sala no caminho): desiste do resto.
    if (world.self.x === before.x && world.self.y === before.y) this.route = [];
  }

  private cancelAuto(): void {
    this.route = [];
    this.setFollowing(null);
  }

  private setFollowing(id: string | null): void {
    if (this.following === id) return;
    this.following = id;
    this.options.onFollowChange?.(id);
  }

  /** Botão "Parar" do card de seguir. */
  stopFollowing(): void {
    this.setFollowing(null);
  }

  private onWorldEvent(event: WorldEvent): void {
    const { world } = this.options;
    switch (event.type) {
      case 'reset':
        this.rebuild();
        break;
      case 'join':
        this.addAvatar(event.player);
        this.renderDesks();
        break;
      case 'leave':
        this.removeAvatar(event.id);
        this.renderDesks();
        break;
      case 'update': {
        const player = world.players.get(event.id);
        if (player) this.refreshAvatar(player);
        break;
      }
      case 'desk':
        this.renderDesk(event.desk.deskKey);
        break;
      case 'chat':
        this.showChat(event.from, event.text);
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
        if (event.type === 'selfCorrected') avatar.mover.correct(event.pos.x, event.pos.y);
        else avatar.mover.push(event.pos.x, event.pos.y);
        break;
      }
    }
  }

  private zoneLabels: Phaser.GameObjects.Container[] = [];

  private renderZoneLabels(): void {
    for (const label of this.zoneLabels) label.destroy();
    this.zoneLabels = [];
    for (const object of objectLayer(this.options.mapJson, 'zones')) {
      const name = prop(object, 'name');
      if (typeof name !== 'string' || name === '') continue;
      this.zoneLabels.push(zonePill(this, object.x + 4, object.y + 3, name).setDepth(LABEL_DEPTH - 1));
    }
  }

  private rebuild(): void {
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
    for (const player of this.options.world.players.values()) this.addAvatar(player);
    this.renderDesks();
  }

  private addAvatar(player: Player): void {
    this.removeAvatar(player.id);
    const { world } = this.options;
    const isSelf = player.id === world.selfId;
    const pos = isSelf ? world.self : player;
    const textureKey = ensureAvatarTexture(this, player.avatar);
    const sprite = this.add.sprite(0, 0, textureKey, idleFrame(pos.dir)).setOrigin(0.5, 1);
    const shadow = this.add.ellipse(0, 0, 12, 5, SHADOW_COLOR, SHADOW_ALPHA);
    const ring = this.add.ellipse(0, 0, 14, 6, SPEAKING_COLOR, 0.35).setStrokeStyle(1, SPEAKING_COLOR).setVisible(false);
    const label = new NamePill(this).setDepth(LABEL_DEPTH);
    const title = new TitlePill(this).setDepth(LABEL_DEPTH);
    const avatar: Avatar = {
      sprite,
      ring,
      shadow,
      label,
      title,
      mover: new Mover(pos.x, pos.y),
      textureKey,
      dir: pos.dir,
      hovered: false,
      chat: null,
      chatTimer: null,
    };
    sprite.setInteractive({ useHandCursor: !isSelf });
    sprite.setData('id', player.id);
    sprite.on('pointerover', () => (avatar.hovered = true));
    sprite.on('pointerout', () => (avatar.hovered = false));
    this.avatars.set(player.id, avatar);
    this.refreshAvatar(player);
    if (isSelf) this.cameras.main.startFollow(sprite, true);
  }

  private refreshAvatar(player: Player): void {
    const avatar = this.avatars.get(player.id);
    if (!avatar) return;
    const self = player.id === this.options.world.selfId;
    avatar.label.set(player.statusEmoji ? `${player.name} ${player.statusEmoji}` : player.name, player.status, self);
    avatar.title.set(player.title ?? '');
    const textureKey = ensureAvatarTexture(this, player.avatar);
    if (textureKey !== avatar.textureKey) {
      avatar.textureKey = textureKey;
      avatar.sprite.setTexture(textureKey, idleFrame(avatar.dir));
    }
  }

  private removeAvatar(id: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    if (this.following === id) this.setFollowing(null);
    avatar.sprite.destroy();
    avatar.ring.destroy();
    avatar.shadow.destroy();
    avatar.label.destroy();
    avatar.title.destroy();
    avatar.chat?.destroy();
    avatar.chatTimer?.remove();
    this.avatars.delete(id);
  }

  /** Posição em pixels de tela (CSS) do topo da cabeça, para os balões de vídeo em HTML. */
  screenPosition(id: string): { x: number; y: number } | null {
    const avatar = this.avatars.get(id);
    if (!avatar) return null;
    const camera = this.cameras.main;
    const view = camera.worldView;
    const scale = camera.zoom * RENDER_SCALE;
    return {
      x: (avatar.sprite.x - view.x) * scale,
      y: (avatar.sprite.y - avatar.sprite.height - view.y) * scale,
    };
  }

  /** Aproxima ou afasta em degraus inteiros. */
  zoom(delta: number): void {
    const next = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, this.zoomIndex + delta));
    if (next === this.zoomIndex) return;
    this.zoomIndex = next;
    this.cameras.main.setZoom(ZOOM_LEVELS[next]);
    this.fitCamera();
  }

  /**
   * Mapa menor que a tela fica centralizado: os limites da câmera crescem para os lados com o
   * fundo vazio, em vez de o mapa grudar no canto superior esquerdo.
   */
  private fitCamera(): void {
    const camera = this.cameras.main;
    const viewW = this.scale.width / camera.zoom;
    const viewH = this.scale.height / camera.zoom;
    const { width, height } = this.mapSize;
    const x = width < viewW ? -Math.floor((viewW - width) / 2) : 0;
    const y = height < viewH ? -Math.floor((viewH - height) / 2) : 0;
    camera.setBounds(x, y, Math.max(width, viewW), Math.max(height, viewH));
  }

  private showChat(id: string, text: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    avatar.chat?.destroy();
    avatar.chatTimer?.remove();
    avatar.chat = chatBubble(this, text).setDepth(LABEL_DEPTH + 1);
    avatar.chatTimer = this.time.delayedCall(CHAT_BUBBLE_MS, () => {
      avatar.chat?.destroy();
      avatar.chat = null;
    });
  }

  private renderDesks(): void {
    for (const desk of this.options.world.map.desks) this.renderDesk(desk.key);
  }

  /** Variação, monitor e itens dos slots; plaquinha com o nome quando o dono está offline. */
  private renderDesk(deskKey: string): void {
    for (const object of this.deskObjects.get(deskKey) ?? []) object.destroy();
    const { world } = this.options;
    const desk = world.map.desks.find((d) => d.key === deskKey);
    if (!desk) return;
    const state = world.desks.get(deskKey);
    const decor = state?.decor ?? null;
    const objects: Phaser.GameObjects.GameObject[] = [];

    const x = desk.x * TILE_PX;
    const bottom = (desk.y + desk.h) * TILE_PX;
    const item = (itemId: string | null, dx: number, dy: number, depth: number, flip = false) => {
      const frame = itemId ? DECOR_FRAMES.get(itemId) : undefined;
      if (frame === undefined) return;
      objects.push(
        this.add
          .image(x + dx, bottom + dy, sheetKey(DESK_TILESET), frame)
          .setOrigin(0, 1)
          .setFlipX(flip)
          .setDepth(depth),
      );
    };

    const variant = decor?.variant ?? 'basic';
    const monitor = `monitor-${decor?.monitor ?? 'single'}`;
    const wide = desk.w === 2;
    const tall = desk.h === 2;
    // Mesa de 2 tiles: o desenho é cortado em metades no tileset e remontado aqui.
    if (wide) {
      item(`${variant}-wide-l`, 0, 0, bottom);
      item(`${variant}-wide-r`, TILE_PX, 0, bottom);
    } else if (tall) {
      item(`${variant}-tall-t`, 0, -TILE_PX, bottom);
      item(`${variant}-tall-b`, 0, 0, bottom);
    } else {
      item(variant, 0, 0, bottom);
    }
    const offsets = wide || tall ? SLOT_OFFSET_WIDE[desk.orientation] : { ...SLOT_OFFSET[desk.orientation], monitor: [0, -2] as const };
    item(monitor, offsets.monitor[0], offsets.monitor[1], bottom + 0.1);
    // Sem parede atrás, a decoração "de parede" vai presa numa divisória em vez de flutuar.
    const divider = decor?.slots.back ? dividerLayout(desk) : null;
    if (divider) {
      for (const piece of divider.pieces) item(piece.item, piece.dx, piece.dy, divider.behind ? bottom - 0.2 : bottom + 0.3, piece.flip);
    }
    if (decor) {
      for (const slot of SLOTS) {
        const [dx, dy] = slot === 'back' && divider ? divider.back : offsets[slot];
        const backDepth = divider ? (divider.behind ? bottom - 0.15 : bottom + 0.35) : bottom - 0.1;
        item(decor.slots[slot], dx, dy, slot === 'back' ? backDepth : bottom + 0.2);
      }
    }

    if (state?.userId && state.ownerName && !world.players.has(state.userId)) {
      objects.push(this.plaque(desk, state.ownerName));
    }
    this.deskObjects.set(deskKey, objects);
  }

  private plaque(desk: CompiledDesk, name: string): Phaser.GameObjects.Container {
    const cx = desk.x * TILE_PX + (desk.w * TILE_PX) / 2;
    return deskPlaque(this, cx, desk.y * TILE_PX - 11, name).setDepth(LABEL_DEPTH - 2);
  }
}
