import type { Status } from '@pixelwork/shared';
import * as Phaser from 'phaser';

/** Fonte da UI (Inter, servida pelo app); os rótulos do mapa usam a mesma. */
export const LABEL_FONT = '"Inter Variable", system-ui, sans-serif';
/** Texto do Phaser rasterizado em alta resolução: nítido no zoom 1, 2 e 3 da câmera. */
const RESOLUTION = 8;

const STATUS_COLOR: Record<Status, number> = { available: 0x1ebc73, focus: 0xe83b3b, away: 0xf79617 };

function text(scene: Phaser.Scene, value: string, color: string, size: number, bold = false): Phaser.GameObjects.Text {
  return scene.add.text(0, 0, value, {
    fontFamily: LABEL_FONT,
    fontSize: `${size}px`,
    fontStyle: bold ? '600' : '500',
    color,
    resolution: RESOLUTION,
  });
}

/**
 * Nome em pílula escura com bolinha de status, centrada em x e com o topo em y (a pílula fica
 * embaixo dos pés, para não brigar com o balão de vídeo acima da cabeça). A própria pessoa usa o
 * azul de ação.
 */
export class NamePill extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly dot: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.bg = scene.add.graphics();
    this.dot = scene.add.graphics();
    this.label = text(scene, '', '#ffffff', 7, true);
    this.add([this.bg, this.dot, this.label]);
    scene.add.existing(this);
  }

  set(value: string, status: Status, self: boolean): this {
    this.label.setText(value);
    const padX = 4;
    const dotSpace = 6;
    const w = Math.ceil(this.label.width) + padX * 2 + dotSpace;
    const h = 11;
    const left = -Math.round(w / 2);
    this.bg.clear().fillStyle(self ? 0x4d65b4 : 0x2e222f, self ? 0.95 : 0.82).fillRoundedRect(left, 0, w, h, h / 2);
    this.dot.clear().fillStyle(STATUS_COLOR[status], 1).fillCircle(left + padX + 2, h / 2, 2);
    this.label.setPosition(left + padX + dotSpace, Math.round((h - this.label.height) / 2));
    return this;
  }
}

/** Rótulo de zona: pílula clara translúcida com texto discreto, no alto à esquerda da zona. */
export function zonePill(scene: Phaser.Scene, x: number, y: number, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#625565', 7, true);
  const w = Math.ceil(label.width) + 10;
  const h = 11;
  const bg = scene.add.graphics().fillStyle(0xffffff, 0.78).fillRoundedRect(0, 0, w, h, h / 2);
  label.setPosition(5, Math.round((h - label.height) / 2));
  return scene.add.container(x, y, [bg, label]);
}

/**
 * Balão de chat branco com borda clara e rabicho, centrado em x com a ponta do rabicho em y
 * (o balão sobe a partir daí).
 */
export function chatBubble(scene: Phaser.Scene, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#2e222f', 7).setWordWrapWidth(104, true);
  const padX = 5;
  const padY = 3;
  const w = Math.ceil(label.width) + padX * 2;
  const h = Math.ceil(label.height) + padY * 2;
  const tail = 3;
  const g = scene.add.graphics();
  g.fillStyle(0xe6ddd2, 1).fillRoundedRect(-w / 2 - 1, -h - tail - 1, w + 2, h + 2, 5);
  g.fillTriangle(-tail - 1, -tail - 1, tail + 1, -tail - 1, 0, 1);
  g.fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -h - tail, w, h, 4);
  g.fillTriangle(-tail, -tail - 1, tail, -tail - 1, 0, 0);
  label.setPosition(-w / 2 + padX, -h - tail + padY);
  return scene.add.container(0, 0, [g, label]);
}

/** Plaquinha da mesa de quem está offline: pílula creme com o nome. */
export function deskPlaque(scene: Phaser.Scene, cx: number, y: number, value: string): Phaser.GameObjects.Container {
  const label = text(scene, value, '#9e4539', 6, true);
  const w = Math.ceil(label.width) + 8;
  const h = 9;
  const bg = scene.add.graphics().fillStyle(0xfff1dc, 0.92).fillRoundedRect(0, 0, w, h, h / 2);
  label.setPosition(4, Math.round((h - label.height) / 2));
  return scene.add.container(Math.round(cx - w / 2), y, [bg, label]);
}
