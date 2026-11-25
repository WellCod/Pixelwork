import type { Status } from '@pixelwork/shared';
import * as Phaser from 'phaser';

/** Fonte da UI (Inter, servida pelo app); os rótulos do mapa usam a mesma. */
export const LABEL_FONT = '"Inter Variable", system-ui, sans-serif';
/** Texto do Phaser rasterizado em alta resolução: nítido no zoom 1, 2 e 3 da câmera. */
const RESOLUTION = 8;
export const LABEL_DEPTH = 100_000;

const STATUS_COLOR: Record<Status, number> = { available: 0x1ebc73, focus: 0xe83b3b, away: 0xf79617 };

/** Texto de rótulo na fonte da UI, rasterizado em alta resolução e com filtro linear. */
function text(scene: Phaser.Scene, value: string, color: string, size: number, bold = false): Phaser.GameObjects.Text {
  const label = scene.add.text(0, 0, value, {
    fontFamily: LABEL_FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? '600' : '500',
    color,
    resolution: RESOLUTION,
  });
  // O jogo é pixelArt (filtro nearest em tudo); texto em alta resolução reduzido com nearest serrilha.
  label.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return label;
}

/** Troca o texto e redesenha mesmo se igual: depois que a fonte carrega, o texto é o mesmo. */
function setLabel(label: Phaser.GameObjects.Text, value: string): void {
  if (label.text === value) label.updateText();
  else label.setText(value);
}

/**
 * Nome em pílula escura com bolinha de status, centrada em x e com o topo em y (a pílula fica
 * embaixo dos pés, para não brigar com o balão de vídeo acima da cabeça). A própria pessoa usa o
 * azul de ação.
 */
export class NamePill extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly dot: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.background = scene.add.graphics();
    this.dot = scene.add.graphics();
    this.label = text(scene, '', '#ffffff', 7, true);
    this.add([this.background, this.dot, this.label]);
    scene.add.existing(this);
  }

  /** Redesenha a pílula com o nome, a cor do status e o destaque de quem é a própria pessoa. */
  set(value: string, status: Status, self: boolean): this {
    setLabel(this.label, value);
    const padX = 4;
    const dotSpace = 6;
    const width = Math.ceil(this.label.width) + padX * 2 + dotSpace;
    const height = 11;
    const left = -Math.round(width / 2);
    this.background
      .clear()
      .fillStyle(self ? 0x4d65b4 : 0x2e222f, self ? 0.95 : 0.82)
      .fillRoundedRect(left, 0, width, height, height / 2);
    this.dot.clear().fillStyle(STATUS_COLOR[status], 1).fillCircle(left + padX + 2, height / 2, 2);
    this.label.setPosition(left + padX + dotSpace, Math.round((height - this.label.height) / 2));
    return this;
  }
}

/**
 * Cargo embaixo do nome: pílula clara com texto legível, centrada em x com o topo em y. Fonte de
 * 6 px sem fundo ficava ilegível sobre o piso.
 */
export class TitlePill extends Phaser.GameObjects.Container {
  private readonly background: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  value = '';

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.background = scene.add.graphics();
    this.label = text(scene, '', '#3e3546', 7, true);
    this.add([this.background, this.label]);
    scene.add.existing(this);
  }

  set(value: string): this {
    this.value = value;
    setLabel(this.label, value);
    const width = Math.ceil(this.label.width) + 8;
    const height = 10;
    const left = -Math.round(width / 2);
    this.background.clear().fillStyle(0xffffff, 0.9).fillRoundedRect(left, 0, width, height, height / 2);
    this.label.setPosition(left + 4, Math.round((height - this.label.height) / 2));
    return this;
  }
}

/** Rótulo de zona: pílula clara translúcida com texto discreto, no alto à esquerda da zona. */
export function zonePill(scene: Phaser.Scene, x: number, y: number, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#625565', 7, true);
  const width = Math.ceil(label.width) + 10;
  const height = 11;
  const background = scene.add.graphics().fillStyle(0xffffff, 0.78).fillRoundedRect(0, 0, width, height, height / 2);
  label.setPosition(5, Math.round((height - label.height) / 2));
  return scene.add.container(x, y, [background, label]);
}

/**
 * Balão de chat branco com borda clara e rabicho, centrado em x com a ponta do rabicho em y
 * (o balão sobe a partir daí).
 */
export function chatBubble(scene: Phaser.Scene, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#2e222f', 7).setWordWrapWidth(104, true);
  const padX = 5;
  const padY = 3;
  const width = Math.ceil(label.width) + padX * 2;
  const height = Math.ceil(label.height) + padY * 2;
  const tail = 3;
  const graphics = scene.add.graphics();
  // Borda: o mesmo desenho 1 px maior em cor clara, por baixo do balão branco.
  graphics.fillStyle(0xe6ddd2, 1).fillRoundedRect(-width / 2 - 1, -height - tail - 1, width + 2, height + 2, 5);
  graphics.fillTriangle(-tail - 1, -tail - 1, tail + 1, -tail - 1, 0, 1);
  graphics.fillStyle(0xffffff, 1).fillRoundedRect(-width / 2, -height - tail, width, height, 4);
  graphics.fillTriangle(-tail, -tail - 1, tail, -tail - 1, 0, 0);
  label.setPosition(-width / 2 + padX, -height - tail + padY);
  return scene.add.container(0, 0, [graphics, label]);
}

/** Plaquinha da mesa de quem está offline: pílula creme com o nome. */
export function deskPlaque(scene: Phaser.Scene, centerX: number, y: number, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#9e4539', 6, true);
  const width = Math.ceil(label.width) + 8;
  const height = 9;
  const background = scene.add.graphics().fillStyle(0xfff1dc, 0.92).fillRoundedRect(0, 0, width, height, height / 2);
  label.setPosition(4, Math.round((height - label.height) / 2));
  return scene.add.container(Math.round(centerX - width / 2), y, [background, label]);
}

/** Placar sobre a mesa de jogo: pílula clara com borda, centrada em x com a base em y. */
export function tablePlaque(scene: Phaser.Scene, centerX: number, y: number, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#2e222f', 7, true);
  const width = Math.ceil(label.width) + 10;
  const height = 11;
  const background = scene.add
    .graphics()
    .fillStyle(0xe6ddd2, 1)
    .fillRoundedRect(-1, -1, width + 2, height + 2, (height + 2) / 2)
    .fillStyle(0xffffff, 0.95)
    .fillRoundedRect(0, 0, width, height, height / 2);
  label.setPosition(5, Math.round((height - label.height) / 2));
  return scene.add.container(Math.round(centerX - width / 2), y - height, [background, label]);
}
