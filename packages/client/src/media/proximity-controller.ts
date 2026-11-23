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

  /**
   * Recalcula ouvir, ver e volume e só repassa à mídia quando algo mudou de fato (volume com
   * tolerância de 0,01), porque este método roda a cada passo de qualquer jogador.
   */
  private update(): void {
    const { world, media } = this;
    if (!world.selfId) return;
    const self = { id: world.selfId, x: world.self.x, y: world.self.y };
    const others = [...world.players.values()].map((player) => ({ id: player.id, x: player.x, y: player.y }));
    const opponent = opponentOf(world);
    // O adversário entra no áudio mesmo fora do raio da proximidade.
    const forced = new Set(opponent ? [opponent] : []);
    const audible = nextProximity(world.map, self, others, this.audible, forced);

    const volumes = new Map<string, number>();
    const near = others.filter((other) => audible.has(other.id));
    // O adversário da partida fica a 4 tiles: volume cheio, como quem está do lado.
    for (const other of near) {
      volumes.set(other.id, forced.has(other.id) ? volumeAt(1) : volumeAt(tileDistance(self, other)));
    }
    const bubbles = selectBubbles(
      self,
      near.map((other) => ({ ...other, hasCamera: media.hasCamera(other.id) })),
      MAX_VIDEO_BUBBLES,
    );

    const changed =
      !sameSet(audible, this.audible) ||
      bubbles.join() !== this.bubbles.join() ||
      [...volumes].some(([id, volume]) => Math.abs(volume - (this.lastVolumes.get(id) ?? -1)) > 0.01);
    if (!changed) return;
    this.audible = audible;
    this.bubbles = bubbles;
    this.lastVolumes = volumes;
    media.setDesired(audible, new Set(bubbles), volumes);
  }
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Adversário humano da partida em andamento do próprio jogador, ou null. */
function opponentOf(world: ClientWorld): string | null {
  const seat = world.seat;
  const table = seat && world.tables.get(seat.tableKey);
  if (!seat || table?.phase !== 'playing') return null;
  const id = seat.side === 'left' ? table.right : table.left;
  return id && id !== 'bot' ? id : null;
}
