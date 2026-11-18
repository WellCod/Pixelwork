import {
  CHAT_MAX_CHARS,
  CLOSE_POLICY,
  CLOSE_SESSION_REPLACED,
  ClientMsg,
  RECONNECT_GRACE_MS,
  TICK_MS,
  chatRecipients,
  step,
  zoneAt,
  type CompiledDesk,
  type CompiledMap,
  type DeskState,
  type Player,
  type ServerMsg,
  type SimPlayer,
  type TickMove,
  type WorldState,
  type ZoneState,
} from '@pixelwork/shared';
import type { PlayerProfile } from '../spaces/members.ts';
import { TokenBucket, WindowCounter, type Clock, type Scheduler, type Timer } from './clock.ts';
import { SPACE_SOURCES, spaceRoom, type MediaService } from './media.ts';

export interface Conn {
  send(data: string): void;
  close(code: number, reason: string): void;
}

const INVALID_WINDOW_MS = 10_000;
const MAX_INVALID = 10;
const RATE_WINDOW_MS = 1_000;
const MAX_MESSAGES_PER_SECOND = 50;
const CHAT_BURST = 3;
const CHAT_PER_SECOND = 1;

interface Member {
  profile: PlayerProfile;
  conn: Conn | null;
  /** Maior `seq` processado desde a conexão atual; vai no `ack` do tick. */
  lastSeq: number;
  ackDirty: boolean;
  leaveTimer: Timer | null;
  invalid: WindowCounter;
  rate: WindowCounter;
  chat: TokenBucket;
}

export interface RuntimeDeps {
  clock: Clock;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (obj: unknown, msg: string) => void };
}

/** Estado em memória de um coworking: jogadores, simulação e broadcast por tick. */
export class SpaceRuntime {
  private world: WorldState = { players: new Map() };
  private readonly members = new Map<string, Member>();
  private readonly moved = new Set<string>();
  private ticker: Timer | null = null;
  private readonly desks = new Map<string, DeskState>();

  constructor(
    readonly spaceId: string,
    private readonly map: CompiledMap,
    private readonly mapVersion: number,
    private readonly deps: RuntimeDeps,
    assignments: readonly DeskState[] = [],
  ) {
    // Toda mesa do mapa tem estado; atribuição de mesa que saiu do mapa é ignorada.
    for (const desk of map.desks) {
      this.desks.set(desk.key, { deskKey: desk.key, userId: null, ownerName: null, decor: null });
    }
    for (const assignment of assignments) {
      if (this.desks.has(assignment.deskKey)) this.desks.set(assignment.deskKey, assignment);
    }
  }

  /** Mesa do mapa compilado, para conferir a cadeira. */
  mapDesk(deskKey: string): CompiledDesk | undefined {
    return this.map.desks.find((d) => d.key === deskKey);
  }

  /** Posição autoritativa de quem está conectado agora. */
  positionOf(userId: string): { x: number; y: number } | null {
    if (!this.members.get(userId)?.conn) return null;
    const p = this.world.players.get(userId);
    return p ? { x: p.x, y: p.y } : null;
  }

  /** Grava o estado da mesa depois do REST e avisa todos. */
  setDesk(desk: DeskState): void {
    if (!this.desks.has(desk.deskKey)) return;
    this.desks.set(desk.deskKey, desk);
    this.broadcast({ t: 'desk.updated', desk });
  }

  /** Atualiza o perfil depois do REST: avisa quem está no coworking e corrige as plaquinhas. */
  updateProfile(userId: string, patch: Partial<Omit<PlayerProfile, 'id'>>): void {
    const member = this.members.get(userId);
    if (member) {
      Object.assign(member.profile, patch);
      this.broadcast({ t: 'player.update', id: userId, patch });
    }
    if (patch.name === undefined) return;
    for (const desk of this.desks.values()) {
      if (desk.userId === userId) this.setDesk({ ...desk, ownerName: patch.name });
    }
  }

  get connectedCount(): number {
    let count = 0;
    for (const member of this.members.values()) if (member.conn) count++;
    return count;
  }

  connect(profile: PlayerProfile, conn: Conn): void {
    const { clock } = this.deps;
    let member = this.members.get(profile.id);

    if (member) {
      const previous = member.conn;
      if (previous) {
        member.conn = null;
        previous.send(JSON.stringify({ t: 'session.replaced' } satisfies ServerMsg));
        previous.close(CLOSE_SESSION_REPLACED, 'session replaced');
      }
      member.leaveTimer?.cancel();
      member.leaveTimer = null;
      member.profile = profile;
    } else {
      member = {
        profile,
        conn: null,
        lastSeq: 0,
        ackDirty: false,
        leaveTimer: null,
        invalid: new WindowCounter(clock, INVALID_WINDOW_MS, MAX_INVALID),
        rate: new WindowCounter(clock, RATE_WINDOW_MS, MAX_MESSAGES_PER_SECOND),
        chat: new TokenBucket(clock, CHAT_BURST, CHAT_PER_SECOND),
      };
      this.members.set(profile.id, member);
      const players = new Map(this.world.players);
      const sim: SimPlayer = { ...this.map.spawn, dir: 'down', lastStepAt: -Infinity };
      players.set(profile.id, sim);
      this.world = { players };
      this.broadcast({ t: 'player.join', player: this.player(profile.id) }, profile.id);
    }

    // O cliente recomeça a contagem de seq a cada welcome.
    member.lastSeq = 0;
    member.ackDirty = false;
    member.conn = conn;
    this.send(conn, {
      t: 'welcome',
      selfId: profile.id,
      mapVersion: this.mapVersion,
      players: [...this.members.keys()].map((id) => this.player(id)),
      zones: this.zoneStates(),
      desks: [...this.desks.values()],
    });
    this.ticker ??= this.deps.scheduler.setInterval(() => this.tick(), TICK_MS);
    void this.joinMedia(profile.id, conn);
  }

  /** Quem decide a sala de mídia é o servidor (invariante 3). Na fase 3, sempre a `space:`. */
  private async joinMedia(userId: string, conn: Conn): Promise<void> {
    const room = spaceRoom(this.spaceId);
    try {
      const token = await this.deps.media.token(userId, room, SPACE_SOURCES);
      // A conexão pode ter caído ou sido substituída enquanto o token era assinado.
      if (this.members.get(userId)?.conn !== conn) return;
      this.send(conn, { t: 'media.join', room, token, url: this.deps.media.url });
    } catch (error) {
      this.deps.log.error({ error, userId, room }, 'falha ao emitir token de mídia');
    }
  }

  onMessage(userId: string, conn: Conn, raw: string | null): void {
    const member = this.members.get(userId);
    if (member?.conn !== conn) return;
    if (member.rate.hit()) {
      conn.close(CLOSE_POLICY, 'rate limit');
      return;
    }

    const msg = raw === null ? null : parseClientMsg(raw);
    if (!msg || (msg.t === 'move' && msg.seq <= member.lastSeq)) {
      if (member.invalid.hit()) conn.close(CLOSE_POLICY, 'invalid messages');
      return;
    }

    switch (msg.t) {
      case 'move': {
        member.lastSeq = msg.seq;
        member.ackDirty = true;
        const result = step(
          this.world,
          [{ playerId: userId, seq: msg.seq, dir: msg.dir }],
          this.deps.clock.now(),
          this.map,
        );
        this.world = result.state;
        for (const event of result.events) this.moved.add(event.id);
        break;
      }
      case 'chat.say':
        this.chat(userId, member, conn, msg.text);
        break;
      default:
        this.send(conn, { t: 'error', code: 'not_implemented' });
    }
  }

  /** Destinatários calculados aqui: o cliente não escolhe quem lê. Nada é guardado. */
  private chat(userId: string, member: Member, conn: Conn, raw: string): void {
    const text = raw.trim();
    const length = Array.from(text).length;
    if (length === 0 || length > CHAT_MAX_CHARS) {
      this.send(conn, { t: 'error', code: 'chat_invalid' });
      return;
    }
    if (!member.chat.take()) {
      this.send(conn, { t: 'error', code: 'chat_rate' });
      return;
    }
    const author = this.world.players.get(userId);
    if (!author) return;
    const players = [...this.world.players].map(([id, p]) => ({ id, x: p.x, y: p.y }));
    const data = JSON.stringify({ t: 'chat.said', from: userId, text } satisfies ServerMsg);
    for (const id of chatRecipients(this.map, { id: userId, x: author.x, y: author.y }, players)) {
      this.members.get(id)?.conn?.send(data);
    }
  }

  onClose(userId: string, conn: Conn): void {
    const member = this.members.get(userId);
    if (member?.conn !== conn) return;
    member.conn = null;
    member.leaveTimer = this.deps.scheduler.setTimeout(() => this.leave(userId), RECONNECT_GRACE_MS);
  }

  /** Envia a lista de quem se moveu, serializada uma vez; só o `ack` muda por cliente. */
  tick(): void {
    const moves: TickMove[] = [];
    for (const id of this.moved) {
      const p = this.world.players.get(id);
      if (p) moves.push([id, p.x, p.y, p.dir]);
    }
    this.moved.clear();
    const movesJson = JSON.stringify(moves);

    for (const member of this.members.values()) {
      if (!member.conn || (moves.length === 0 && !member.ackDirty)) continue;
      member.ackDirty = false;
      member.conn.send(`{"t":"tick","ack":${member.lastSeq},"moves":${movesJson}}`);
    }
  }

  close(): void {
    this.ticker?.cancel();
    this.ticker = null;
    for (const member of this.members.values()) {
      member.leaveTimer?.cancel();
      member.conn?.close(1001, 'server shutdown');
    }
    this.members.clear();
    this.world = { players: new Map() };
  }

  private leave(userId: string): void {
    if (!this.members.delete(userId)) return;
    const players = new Map(this.world.players);
    players.delete(userId);
    this.world = { players };
    this.moved.delete(userId);
    this.broadcast({ t: 'player.leave', id: userId });
    if (this.members.size === 0) {
      this.ticker?.cancel();
      this.ticker = null;
    }
  }

  private player(id: string): Player {
    const member = this.members.get(id);
    const sim = this.world.players.get(id);
    if (!member || !sim) throw new Error(`jogador ${id} sem estado`);
    return { ...member.profile, x: sim.x, y: sim.y, dir: sim.dir, activity: 'idle' };
  }

  private zoneStates(): ZoneState[] {
    const zones = this.map.zones
      .filter((z) => z.type === 'meeting')
      .map((z): ZoneState => ({ zoneKey: z.key, locked: false, occupants: [] }));
    for (const [id, p] of this.world.players) {
      const zone = zones.find((z) => z.zoneKey === zoneAt(this.map, p.x, p.y).key);
      zone?.occupants.push(id);
    }
    return zones;
  }

  private send(conn: Conn, msg: ServerMsg): void {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg, exceptId?: string): void {
    const data = JSON.stringify(msg);
    for (const [id, member] of this.members) {
      if (id !== exceptId) member.conn?.send(data);
    }
  }
}

function parseClientMsg(raw: string): ClientMsg | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = ClientMsg.safeParse(json);
  return parsed.success ? parsed.data : null;
}
