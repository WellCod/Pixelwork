import type { ClientMsg, CompiledMap, Dir, Player, ServerMsg } from '@pixelwork/shared';
import { predictStep, reconcile, type PendingMove, type Pos } from './reconcile.ts';

export type WorldEvent =
  | { type: 'reset' }
  | { type: 'join'; player: Player }
  | { type: 'leave'; id: string }
  | { type: 'remoteMove'; id: string; x: number; y: number; dir: Dir }
  /** A predição divergiu do servidor: o avatar próprio vai direto para `pos`. */
  | { type: 'selfCorrected'; pos: Pos }
  | { type: 'selfStep'; pos: Pos };

/** Estado do coworking no cliente: jogadores conhecidos e predição do próprio avatar. */
export class ClientWorld {
  selfId: string | null = null;
  readonly players = new Map<string, Player>();
  self: Pos = { x: 0, y: 0, dir: 'down' };
  private authoritative: Pos = { x: 0, y: 0, dir: 'down' };
  private pending: PendingMove[] = [];
  private seq = 0;
  private readonly listeners = new Set<(event: WorldEvent) => void>();

  constructor(private readonly map: CompiledMap) {}

  subscribe(listener: (event: WorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  handle(msg: ServerMsg): void {
    switch (msg.t) {
      case 'welcome': {
        this.selfId = msg.selfId;
        this.players.clear();
        for (const p of msg.players) this.players.set(p.id, p);
        const me = this.players.get(msg.selfId);
        this.self = me ? { x: me.x, y: me.y, dir: me.dir } : this.self;
        this.authoritative = this.self;
        this.pending = [];
        this.seq = 0;
        this.emit({ type: 'reset' });
        break;
      }
      case 'tick': {
        for (const [id, x, y, dir] of msg.moves) {
          const player = this.players.get(id);
          if (player) Object.assign(player, { x, y, dir });
          if (id === this.selfId) this.authoritative = { x, y, dir };
          else this.emit({ type: 'remoteMove', id, x, y, dir });
        }
        const result = reconcile(this.authoritative, msg.ack, this.pending, this.map);
        this.pending = result.pending;
        if (result.pos.x !== this.self.x || result.pos.y !== this.self.y) {
          this.self = result.pos;
          this.emit({ type: 'selfCorrected', pos: this.self });
        }
        break;
      }
      case 'player.join':
        this.players.set(msg.player.id, msg.player);
        this.emit({ type: 'join', player: msg.player });
        break;
      case 'player.leave':
        this.players.delete(msg.id);
        this.emit({ type: 'leave', id: msg.id });
        break;
      case 'player.update': {
        const player = this.players.get(msg.id);
        if (player) Object.assign(player, msg.patch);
        break;
      }
      default:
        break;
    }
  }

  /** Aplica a predição e devolve a mensagem a enviar. */
  move(dir: Dir): ClientMsg {
    this.seq++;
    this.pending.push({ seq: this.seq, dir });
    this.self = predictStep(this.self, dir, this.map);
    this.emit({ type: 'selfStep', pos: this.self });
    return { t: 'move', seq: this.seq, dir };
  }

  private emit(event: WorldEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
