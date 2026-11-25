import { DIR_DELTA, TILE_PX, isWalkable, zoneAt, type CompiledMap, type Tile } from '@pixelwork/shared';
import type * as Phaser from 'phaser';
import { LABEL_DEPTH, LABEL_FONT } from './labels.ts';

const ANIMATION_MS = 180;
const CLOSE_DELAY_MS = 450;
const STATUS = {
  open: { label: 'Aberta', ink: 0x1e573c, light: 0x9be4a3, background: '#225440' },
  closed: { label: 'Fechada', ink: 0x744623, light: 0xffcf7a, background: '#684623' },
  locked: { label: 'Trancada', ink: 0x752c38, light: 0xffc1aa, background: '#792b3b' },
} as const;

type DoorStatus = keyof typeof STATUS;

/** Portas contíguas no mesmo vão compartilham a animação e o indicador. */
export function createMeetingDoors(scene: Phaser.Scene, map: CompiledMap, tiles: readonly Tile[]) {
  const rooms = new Map<string, Tile[]>();
  const staticTiles: Tile[] = [];
  for (const tile of tiles) {
    const { x, y } = tile;
    const approaches = [tile, ...Object.values(DIR_DELTA).map(([dx, dy]) => ({ x: x + dx, y: y + dy }))];
    const zone = approaches.filter((entry) => isWalkable(map, entry.x, entry.y))
      .map((entry) => zoneAt(map, entry.x, entry.y)).find((entry) => entry.type === 'meeting');
    if (!zone || !isWalkable(map, x, y)) {
      staticTiles.push(tile);
      continue;
    }
    const room = rooms.get(zone.key) ?? [];
    room.push(tile);
    rooms.set(zone.key, room);
  }

  const animated: MeetingDoor[] = [];
  for (const [zoneKey, room] of rooms) {
    room.sort((a, b) => a.y - b.y || a.x - b.x);
    const groups: Tile[][] = [];
    for (const tile of room) {
      const lastGroup = groups.at(-1);
      const previous = lastGroup?.at(-1);
      if (previous && previous.y === tile.y && previous.x + 1 === tile.x) lastGroup?.push(tile);
      else groups.push([tile]);
    }
    for (const group of groups) {
      const start = group[0];
      if (start) animated.push(new MeetingDoor(scene, zoneKey, start, group.length));
    }
  }
  return { animated, staticTiles };
}

export class MeetingDoor {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private progress = 0;
  private closeAt = -Infinity;
  private previousGap = -1;
  private previousStatus: DoorStatus | undefined;

  constructor(scene: Phaser.Scene, readonly zoneKey: string, private readonly start: Tile, private readonly count: number) {
    const x = start.x * TILE_PX;
    const y = start.y * TILE_PX;
    this.graphics = scene.add.graphics().setPosition(x, y).setDepth(y + TILE_PX - 0.2);
    this.label = scene.add.text(x + count * TILE_PX / 2, y - 4, '', {
      fontFamily: LABEL_FONT, fontSize: '6px', fontStyle: 'bold', color: '#fff6e8',
      padding: { x: 2, y: 1 }, resolution: 4,
    }).setOrigin(0.5, 1).setDepth(LABEL_DEPTH - 2);
    this.draw('closed', 0);
  }

  update(time: number, delta: number, locked: boolean, players: readonly Tile[]): void {
    const { x, y } = this.start;
    const near = players.some((player) => Math.abs(player.y - y) <= 1
      && (player.y === y ? player.x >= x - 1 && player.x <= x + this.count : player.x >= x && player.x < x + this.count));
    if (locked) this.closeAt = -Infinity;
    else if (near) this.closeAt = time + CLOSE_DELAY_MS;
    const open = time < this.closeAt;
    this.progress = Math.max(0, Math.min(1, this.progress + (open ? delta : -delta) / ANIMATION_MS));
    const travel = this.count * TILE_PX / 2 - 3;
    const gap = Math.round(travel * this.progress * this.progress * (3 - 2 * this.progress));
    this.draw(locked ? 'locked' : gap > 0 ? 'open' : 'closed', gap);
  }

  private draw(state: DoorStatus, gap: number): void {
    if (this.previousStatus === state && this.previousGap === gap) return;
    const status = STATUS[state];
    if (this.previousStatus !== state) this.label.setText(status.label).setBackgroundColor(status.background);
    this.previousGap = gap;
    this.previousStatus = state;

    const width = this.count * TILE_PX;
    const center = width / 2;
    const leafWidth = center - 2 - gap;
    const g = this.graphics.clear();
    g.fillStyle(0x372938).fillRect(0, 0, width, 2).fillRect(0, 0, 2, 16).fillRect(width - 2, 0, 2, 16);
    g.fillStyle(0x796574).fillRect(1, 1, 1, 14).fillRect(width - 2, 1, 1, 14);
    g.fillStyle(0x493940, 0.35).fillRect(2, 14, width - 4, 2);

    for (const x of [2, center + gap]) {
      g.fillStyle(0x51352f).fillRect(x, 2, leafWidth, 12);
      const panel = state === 'locked' ? 0x94606a : 0xbd8b65;
      g.fillStyle(panel).fillRect(x, 3, leafWidth, 10);
      if (leafWidth > 3) g.fillStyle(0xffdbb5, 0.55).fillRect(x + 1, 4, leafWidth - 2, 3);
    }
    g.fillStyle(status.ink).fillRect(center - 3, 0, 6, 3);
    g.fillStyle(status.light).fillRect(center - 1, 1, 2, 1);
    if (state === 'locked') {
      g.fillStyle(status.ink).fillRect(center - 4, 5, 8, 8);
      g.fillStyle(status.light).fillRect(center - 2, 6, 4, 1)
        .fillRect(center - 2, 7, 1, 2).fillRect(center + 1, 7, 1, 2).fillRect(center - 3, 9, 6, 3);
      g.fillStyle(status.ink).fillRect(center, 10, 1, 1);
    } else if (gap === 0) {
      g.fillStyle(status.ink).fillRect(center - 1, 3, 2, 10);
      g.fillStyle(status.light).fillRect(center - 2, 8, 1, 2).fillRect(center + 1, 8, 1, 2);
    }
  }
}
