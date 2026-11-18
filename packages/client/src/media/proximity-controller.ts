import { MAX_VIDEO_BUBBLES, nextProximity, selectBubbles, tileDistance, volumeAt } from '@pixelwork/shared';
import type { ClientWorld } from '../net/client-world.ts';
import type { MediaManager } from './media-manager.ts';

/**
 * Liga posição e mídia: a cada movimento ou mudança de câmera, recalcula quem ouvir
 * (proximidade com histerese), quem ver (balões) e o volume de cada um.
 */
export class ProximityController {
  audible = new Set<string>();
  bubbles: string[] = [];
  private lastVolumes = new Map<string, number>();
  private readonly stops: (() => void)[] = [];

  constructor(
    private readonly world: ClientWorld,
    private readonly media: MediaManager,
  ) {}

  start(): void {
    this.stops.push(this.world.subscribe(() => this.update()));
    this.stops.push(this.media.subscribe(() => this.update()));
    this.update();
  }

  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  private update(): void {
    const { world, media } = this;
    if (!world.selfId) return;
    const self = { id: world.selfId, x: world.self.x, y: world.self.y };
    const others = [...world.players.values()].map((p) => ({ id: p.id, x: p.x, y: p.y }));
    const audible = nextProximity(world.map, self, others, this.audible);

    const volumes = new Map<string, number>();
    const near = others.filter((o) => audible.has(o.id));
    for (const o of near) volumes.set(o.id, volumeAt(tileDistance(self, o)));
    const bubbles = selectBubbles(
      self,
      near.map((o) => ({ ...o, hasCamera: media.hasCamera(o.id) })),
      MAX_VIDEO_BUBBLES,
    );

    const changed =
      !sameSet(audible, this.audible) ||
      bubbles.join() !== this.bubbles.join() ||
      [...volumes].some(([id, v]) => Math.abs(v - (this.lastVolumes.get(id) ?? -1)) > 0.01);
    if (!changed) return;
    this.audible = audible;
    this.bubbles = bubbles;
    this.lastVolumes = volumes;
    media.setDesired(audible, new Set(bubbles), volumes);
  }
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x));
}
