import { zoneAt, type ClientMsg, type CompiledMap, type DeskState, type Dir, type Player, type ServerMsg, type ZoneState } from '@pixelwork/shared';
import { predictStep, reconcile, type CanEnter, type PendingMove, type Pos } from './reconcile.ts';

export type WorldEvent =
  | { type: 'reset' }
  | { type: 'join'; player: Player }
  | { type: 'leave'; id: string }
  | { type: 'update'; id: string }
  | { type: 'desk'; desk: DeskState }
  | { type: 'chat'; from: string; text: string }
  | { type: 'error'; code: string }
  | { type: 'zone'; zone: ZoneState }
  | { type: 'mapUpdated'; version: number }
  | { type: 'knockRequest'; requestId: string; zoneKey: string; from: string }
  | { type: 'knockResult'; zoneKey: string; allowed: boolean }
  | { type: 'callIncoming'; callId: string; from: string }
  | { type: 'callEnded'; callId: string; reason: 'declined' | 'left' | 'timeout' | 'busy' }
  | { type: 'remoteMove'; id: string; x: number; y: number; dir: Dir }
  /** A predição divergiu do servidor: o avatar próprio vai direto para `pos`. */
  | { type: 'selfCorrected'; pos: Pos }
  | { type: 'selfStep'; pos: Pos };

/** Estado do coworking no cliente: jogadores conhecidos e predição do próprio avatar. */
export class ClientWorld {
  selfId: string | null = null;
  readonly players = new Map<string, Player>();
  readonly desks = new Map<string, DeskState>();
  readonly zones = new Map<string, ZoneState>();
  /** Muda a cada evento; a UI em React usa como snapshot. */
  version = 0;
  self: Pos = { x: 0, y: 0, dir: 'down' };
  private authoritative: Pos = { x: 0, y: 0, dir: 'down' };
  private pending: PendingMove[] = [];
  private seq = 0;
  /** Salas trancadas em que a batida foi aceita: a predição deixa entrar. */
  private readonly allowedZones = new Set<string>();
  /** Correções de posição desde o welcome (overlay de netcode). */
  corrections = 0;
  /** Hora do servidor no último tick e quando chegou aqui, para a latência do tick. */
  lastTick: { serverTs: number; receivedAt: number } | null = null;
  private readonly listeners = new Set<(event: WorldEvent) => void>();

  constructor(public map: CompiledMap) {}

  /** Mapa novo depois de um `map.updated`; quem ficou em tile bloqueado chega pelo tick. */
  setMap(map: CompiledMap): void {
    this.map = map;
  }

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
        this.desks.clear();
        for (const d of msg.desks) this.desks.set(d.deskKey, d);
        this.zones.clear();
        for (const z of msg.zones) this.zones.set(z.zoneKey, z);
        const me = this.players.get(msg.selfId);
        this.self = me ? { x: me.x, y: me.y, dir: me.dir } : this.self;
        this.authoritative = this.self;
        this.pending = [];
        this.seq = 0;
        this.allowedZones.clear();
        this.emit({ type: 'reset' });
        break;
      }
      case 'tick': {
        if (msg.ts !== undefined) this.lastTick = { serverTs: msg.ts, receivedAt: Date.now() };
        for (const [id, x, y, dir] of msg.moves) {
          const player = this.players.get(id);
          if (player) Object.assign(player, { x, y, dir });
          if (id === this.selfId) this.authoritative = { x, y, dir };
          else this.emit({ type: 'remoteMove', id, x, y, dir });
        }
        const result = reconcile(this.authoritative, msg.ack, this.pending, this.map, this.canEnter);
        this.pending = result.pending;
        if (result.pos.x !== this.self.x || result.pos.y !== this.self.y) {
          this.corrections++;
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
        this.emit({ type: 'update', id: msg.id });
        break;
      }
      case 'desk.updated':
        this.desks.set(msg.desk.deskKey, msg.desk);
        this.emit({ type: 'desk', desk: msg.desk });
        break;
      case 'chat.said':
        this.emit({ type: 'chat', from: msg.from, text: msg.text });
        break;
      case 'error':
        this.emit({ type: 'error', code: msg.code });
        break;
      case 'map.updated':
        this.emit({ type: 'mapUpdated', version: msg.version });
        break;
      case 'zone.state':
        this.zones.set(msg.zone.zoneKey, msg.zone);
        if (!msg.zone.locked) this.allowedZones.delete(msg.zone.zoneKey);
        this.emit({ type: 'zone', zone: msg.zone });
        break;
      case 'zone.knockRequest':
        this.emit({ type: 'knockRequest', requestId: msg.requestId, zoneKey: msg.zoneKey, from: msg.from });
        break;
      case 'zone.knockResult':
        if (msg.allowed) this.allowedZones.add(msg.zoneKey);
        this.emit({ type: 'knockResult', zoneKey: msg.zoneKey, allowed: msg.allowed });
        break;
      case 'call.incoming':
        this.emit({ type: 'callIncoming', callId: msg.callId, from: msg.from });
        break;
      case 'call.ended':
        this.emit({ type: 'callEnded', callId: msg.callId, reason: msg.reason });
        break;
      default:
        break;
    }
  }

  /** Aplica a predição e devolve a mensagem a enviar. */
  move(dir: Dir): ClientMsg {
    this.seq++;
    this.pending.push({ seq: this.seq, dir });
    this.self = predictStep(this.self, dir, this.map, this.canEnter);
    this.emit({ type: 'selfStep', pos: this.self });
    return { t: 'move', seq: this.seq, dir };
  }

  /** Passos enviados e ainda não confirmados pelo servidor. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Posição que o servidor confirmou por último (o "fantasma" do overlay de netcode). */
  get confirmed(): Pos {
    return this.authoritative;
  }

  /** Espelha a regra do servidor: sala trancada só para quem já está dentro ou foi liberado. */
  private readonly canEnter: CanEnter = (from, x, y) => {
    const zone = zoneAt(this.map, x, y);
    if (zone.type !== 'meeting' || !this.zones.get(zone.key)?.locked) return true;
    return zoneAt(this.map, from.x, from.y).key === zone.key || this.allowedZones.has(zone.key);
  };

  private emit(event: WorldEvent): void {
    this.version++;
    for (const listener of this.listeners) listener(event);
  }
}
