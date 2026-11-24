import {
  CHAT_BUBBLE_MS,
  CONTACT_SHADOW_COLOR,
  deskContactShadows,
  findPath,
  furnitureContactShadows,
  isCornerSofa,
  STEP_MS,
  TILESETS,
  TILESET_IDS,
  PROXIMITY_ENTER_TILES,
  TILE_PX,
  tilesetImageUrl,
  type ClientMsg,
  type CompiledDesk,
  type ContactShadow,
  type Dir,
  type Player,
} from '@pixelwork/shared';
import * as Phaser from 'phaser';
import type { ClientWorld, WorldEvent } from '../net/client-world.ts';
import { idleFrame, seatedFrame } from './avatar-compose.ts';
import { ensureAvatarTexture, preloadCharacterLayers, walkAnim } from './avatar-texture.ts';
import { LABEL_FONT, NamePill, TitlePill, chatBubble, deskPlaque, tablePlaque, zonePill } from './labels.ts';
import { Mover } from './mover.ts';
import { drawDeskJoins } from './desk-joins.ts';
import { deskDecorFrame, deskSprites, isNear, seatedPose } from './presence.ts';
import { baseZoom, canvasToCss } from './scale.ts';
import { embedTilesets, objectLayer, propertyValue, resolveGid } from './tiled.ts';
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
  stool: Phaser.GameObjects.Graphics;
  label: NamePill;
  title: TitlePill;
  mover: Mover;
  textureKey: string;
  dir: Dir;
  hovered: boolean;
  chat: Phaser.GameObjects.Container | null;
  chatTimer: Phaser.Time.TimerEvent | null;
}

const AVATAR_SHADOW_ALPHA = 0.18;
/** Zoom da câmera em múltiplos do zoom base (`baseZoom`): inteiro, para o pixel art não borrar. */
const ZOOM_LEVELS = [1, 2, 3] as const;
const SPEAKING_COLOR = 0x63c74d;
const LABEL_DEPTH = 100_000;

const sheetKey = (id: string) => `sheet:${id}`;
const tilesKey = (id: string) => `tiles:${id}`;

function paintContactShadows(graphics: Phaser.GameObjects.Graphics, x: number, bottom: number, shadows: readonly ContactShadow[]): void {
  for (const shadow of shadows) {
    graphics.fillStyle(CONTACT_SHADOW_COLOR, shadow.alpha);
    graphics.fillEllipse(x + shadow.centerX, bottom + shadow.centerY, shadow.width, shadow.height);
  }
}

/**
 * Cena do coworking: mapa, móveis, mesas, avatares e rótulos. Lê o estado do `ClientWorld`,
 * transforma teclado e clique em passos, e desenha a predição do próprio avatar e a interpolação
 * dos outros.
 */
export class WorldScene extends Phaser.Scene {
  private readonly avatars = new Map<string, Avatar>();
  private readonly deskObjects = new Map<string, Phaser.GameObjects.GameObject[]>();
  /** Placar sobre cada mesa de jogo, visível só para quem está perto. */
  private readonly tablePlaques = new Map<string, Phaser.GameObjects.Container>();
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

    // Sombras acima do piso e abaixo das paredes e dos sprites.
    const shadows = this.add.graphics().setDepth(-1.5);
    for (const desk of this.options.world.map.desks) {
      paintContactShadows(shadows, desk.x * TILE_PX, (desk.y + desk.height) * TILE_PX,
        deskContactShadows(desk.width * TILE_PX, desk.height * TILE_PX));
    }
    for (const object of objectLayer(mapJson, 'furniture')) {
      const tile = object.gid ? resolveGid(mapJson, object.gid) : null;
      if (!tile) continue;
      const tileset = TILESETS[tile.id];
      const { tileWidth, tileHeight } = tileset;
      const item = tileset.items[tile.frame];
      if (tileset.collides.includes(tile.frame)) {
        paintContactShadows(shadows, object.x, object.y, furnitureContactShadows(item, tileWidth, tileHeight));
      }
      const image = this.add.image(object.x, object.y, sheetKey(tile.id), tile.frame).setOrigin(0, 1).setDepth(object.y);
      if (isCornerSofa(item, tileWidth, tileHeight)) {
        // A fileira de trás fica atrás de quem anda no vão, na frente do sofá.
        image.setCrop(0, TILE_PX, tileWidth, TILE_PX);
        this.add.image(object.x, object.y, sheetKey(tile.id), tile.frame)
          .setOrigin(0, 1).setDepth(object.y - TILE_PX).setCrop(0, 0, tileWidth, TILE_PX);
      }
    }
    drawDeskJoins(this, this.options.world.map.desks);
    this.renderZoneLabels();

    this.mapSize = { width: tilemap.widthInPixels, height: tilemap.heightInPixels };
    this.cameras.main.setRoundPixels(true).setZoom((ZOOM_LEVELS[this.zoomIndex] ?? 1) * baseZoom());
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.fitCamera());

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('teclado indisponível');
    const keyCodes = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [keyboard.addKey(keyCodes.UP), keyboard.addKey(keyCodes.W)],
      down: [keyboard.addKey(keyCodes.DOWN), keyboard.addKey(keyCodes.S)],
      left: [keyboard.addKey(keyCodes.LEFT), keyboard.addKey(keyCodes.A)],
      right: [keyboard.addKey(keyCodes.RIGHT), keyboard.addKey(keyCodes.D)],
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
    this.renderTables();
    // A Inter chega por CSS; quando carrega, os rótulos são redesenhados com ela (antes saem na
    // fonte reserva). Só os rótulos: refazer os avatares cancelaria o seguir e os balões de chat.
    // Se a fonte não carregar, os rótulos ficam na reserva.
    if (!document.fonts.check(`7px ${LABEL_FONT}`)) {
      document.fonts
        .load(`600 7px ${LABEL_FONT}`)
        .then(() => {
          if (!this.sys.isActive()) return;
          this.renderZoneLabels();
          for (const player of this.options.world.players.values()) this.refreshAvatar(player);
          this.renderDesks();
          this.renderTables();
        })
        .catch(() => undefined);
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

  /**
   * A cada frame: tecla segurada anda (e cancela clique para andar e seguir); sem tecla, segue a
   * rota automática. Depois anima cada avatar pelo `Mover` e escolhe o quadro (andando, sentado
   * ou parado).
   */
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
      const moving = avatar.mover.moving;
      const seated = moving ? null : seatedPose(world.map, world.desks, id, avatar.mover.x, avatar.mover.y);
      // O pé fica na base do tile. Na cadeira, a pose desloca o desenho até o meio da mesa.
      const x = avatar.mover.x * TILE_PX + TILE_PX / 2 + (seated?.dx ?? 0);
      const y = avatar.mover.y * TILE_PX + TILE_PX + (seated?.dy ?? 0);
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

      // Tecla segurada contra o tampo não tira o banco se o avatar continua no mesmo lugar.
      const walking = moving || (seated === null && id === world.selfId && held !== undefined);
      avatar.stool.setPosition(x, y).setDepth(y - 0.3).setVisible(seated !== null);
      if (walking) avatar.sprite.play(walkAnim(avatar.textureKey, avatar.dir), true);
      else avatar.sprite.stop().setFrame(seated ? seatedFrame(seated.facing) : idleFrame(avatar.dir));
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
    const clicked = over
      .map((gameObject) => gameObject.getData('id') as string | undefined)
      .find((id) => id && id !== world.selfId);
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

  /**
   * Passo automático: seguindo alguém, recalcula o caminho até ficar a um tile da pessoa; com rota
   * de clique, consome o próximo passo dela.
   */
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
        this.renderTables();
        break;
      case 'table':
        this.renderTables();
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
        this.updateTablePlaques();
        break;
      }
    }
  }

  /** Placar de cada mesa: "Livre", "Esperando" ou "Ana 3 × 5 Bruno". */
  private renderTables(): void {
    const { world } = this.options;
    for (const plaque of this.tablePlaques.values()) plaque.destroy();
    this.tablePlaques.clear();
    const firstName = (id: string | null) =>
      id === 'bot' ? 'Bot' : id ? ((world.players.get(id)?.name ?? 'Alguém').split(' ')[0] ?? 'Alguém') : '…';
    for (const table of world.map.tables) {
      const state = world.tables.get(table.key);
      const gameName = table.game === 'foosball' ? 'Pebolim' : 'Pingpong';
      const text =
        !state || state.phase === 'free'
          ? `${gameName}: livre`
          : state.phase === 'waiting'
            ? `${gameName}: esperando`
            : `${firstName(state.left)} ${state.score.left} × ${state.score.right} ${firstName(state.right)}`;
      const centerX = (table.x + table.width / 2) * TILE_PX;
      this.tablePlaques.set(table.key, tablePlaque(this, centerX, table.y * TILE_PX - 2, text).setDepth(LABEL_DEPTH - 2));
    }
    this.updateTablePlaques();
  }

  /** Só quem está a até PROXIMITY_ENTER_TILES da pegada da mesa vê o placar. */
  private updateTablePlaques(): void {
    const { world } = this.options;
    for (const table of world.map.tables) {
      const plaque = this.tablePlaques.get(table.key);
      if (!plaque) continue;
      // Distância até o tile mais próximo da pegada (zero em cada eixo quando está dentro dela).
      const dx = Math.max(table.x - world.self.x, 0, world.self.x - (table.x + table.width - 1));
      const dy = Math.max(table.y - world.self.y, 0, world.self.y - (table.y + table.height - 1));
      plaque.setVisible(Math.hypot(dx, dy) <= PROXIMITY_ENTER_TILES);
    }
  }

  private zoneLabels: Phaser.GameObjects.Container[] = [];

  private renderZoneLabels(): void {
    for (const label of this.zoneLabels) label.destroy();
    this.zoneLabels = [];
    for (const object of objectLayer(this.options.mapJson, 'zones')) {
      const name = propertyValue(object, 'name');
      if (typeof name !== 'string' || name === '') continue;
      this.zoneLabels.push(zonePill(this, object.x + 4, object.y + 3, name).setDepth(LABEL_DEPTH - 1));
    }
  }

  /** Refaz todos os avatares e mesas a partir do estado do mundo (welcome). */
  private rebuild(): void {
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
    for (const player of this.options.world.players.values()) this.addAvatar(player);
    this.renderDesks();
  }

  private addAvatar(player: Player): void {
    this.removeAvatar(player.id);
    const { world } = this.options;
    const isSelf = player.id === world.selfId;
    // O próprio avatar nasce na posição prevista, não na última que o servidor mandou.
    const position = isSelf ? world.self : player;
    const textureKey = ensureAvatarTexture(this, player.avatar);
    const sprite = this.add.sprite(0, 0, textureKey, idleFrame(position.dir)).setOrigin(0.5, 1);
    const shadow = this.add.ellipse(0, 0, 12, 5, CONTACT_SHADOW_COLOR, AVATAR_SHADOW_ALPHA);
    // O banco aparece sob o sprite sentado. A sombra do avatar fica abaixo dos pés do banco.
    const stool = this.add.graphics().setVisible(false)
      .fillStyle(0x374e4a).fillRect(-6, -5, 2, 5).fillRect(4, -5, 2, 5)
      .fillStyle(0x966c6c).fillRoundedRect(-7, -8, 14, 4, 1)
      .fillStyle(0xe6cba5).fillRect(-6, -8, 12, 2);
    const ring = this.add.ellipse(0, 0, 14, 6, SPEAKING_COLOR, 0.35).setStrokeStyle(1, SPEAKING_COLOR).setVisible(false);
    const label = new NamePill(this).setDepth(LABEL_DEPTH);
    const title = new TitlePill(this).setDepth(LABEL_DEPTH);
    const avatar: Avatar = {
      sprite,
      ring,
      shadow,
      stool,
      label,
      title,
      mover: new Mover(position.x, position.y),
      textureKey,
      dir: position.dir,
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

  /** Atualiza nome, status, cargo e textura (avatar trocado) sem recriar o avatar. */
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
    avatar.stool.destroy();
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
    // Mundo -> canvas pela janela visível da câmera e pelo zoom; canvas -> CSS pelo devicePixelRatio.
    const camera = this.cameras.main;
    const view = camera.worldView;
    const scale = canvasToCss(camera.zoom);
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
    this.cameras.main.setZoom((ZOOM_LEVELS[next] ?? 1) * baseZoom());
    this.fitCamera();
  }

  /**
   * Mapa menor que a tela fica centralizado: os limites da câmera crescem para os lados com o
   * fundo vazio, em vez de o mapa grudar no canto superior esquerdo.
   */
  private fitCamera(): void {
    const camera = this.cameras.main;
    const viewWidth = this.scale.width / camera.zoom;
    const viewHeight = this.scale.height / camera.zoom;
    const { width, height } = this.mapSize;
    const x = width < viewWidth ? -Math.floor((viewWidth - width) / 2) : 0;
    const y = height < viewHeight ? -Math.floor((viewHeight - height) / 2) : 0;
    camera.setBounds(x, y, Math.max(width, viewWidth), Math.max(height, viewHeight));
  }

  /** Balão de chat sobre o avatar por CHAT_BUBBLE_MS; mensagem nova substitui a anterior. */
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
    const desk = world.map.desks.find((candidate) => candidate.key === deskKey);
    if (!desk) return;
    const state = world.desks.get(deskKey);
    const decor = state?.decor ?? null;
    const objects: Phaser.GameObjects.GameObject[] = [];

    // Os sprites da mesa são posicionados a partir do canto esquerdo e da base da pegada, e a
    // profundidade de cada um é a da base somada ao z relativo que o `deskSprites` define.
    const x = desk.x * TILE_PX;
    const bottom = (desk.y + desk.height) * TILE_PX;
    const addItem = (itemId: string, dx: number, dy: number, depth: number, flip: boolean, flipY: boolean) => {
      const sprite = deskDecorFrame(itemId);
      if (!sprite) return;
      objects.push(
        this.add
          .image(x + dx, bottom + dy, sheetKey(sprite.tileset), sprite.frame)
          .setOrigin(0, 1)
          .setFlip(flip, flipY)
          .setDepth(depth),
      );
    };

    for (const sprite of deskSprites(desk, decor)) addItem(sprite.item, sprite.dx, sprite.dy, bottom + sprite.z, sprite.flip, sprite.flipY);

    if (state?.userId && state.ownerName && !world.players.has(state.userId)) {
      objects.push(this.plaque(desk, state.ownerName));
    }
    this.deskObjects.set(deskKey, objects);
  }

  private plaque(desk: CompiledDesk, name: string): Phaser.GameObjects.Container {
    const centerX = desk.x * TILE_PX + (desk.width * TILE_PX) / 2;
    return deskPlaque(this, centerX, desk.y * TILE_PX - 11, name).setDepth(LABEL_DEPTH - 2);
  }
}
