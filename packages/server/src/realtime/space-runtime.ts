import {
  CLOSE_POLICY,
  CLOSE_SESSION_REPLACED,
  ClientMsg,
  RECONNECT_GRACE_MS,
  TICK_MS,
  step,
  zoneAt,
  type CompiledMap,
  type Player,
  type ServerMsg,
  type SimPlayer,
  type TickMove,
  type WorldState,
  type ZoneState,
} from '@pixelwork/shared';
import type { PlayerProfile } from '../spaces/members.ts';
import { WindowCounter, type Clock, type Scheduler, type Timer } from './clock.ts';

export interface Conn {
  send(data: string): void;
  close(code: number, reason: string): void;
}

const INVALID_WINDOW_MS = 10_000;
const MAX_INVALID = 10;
const RATE_WINDOW_MS = 1_000;
const MAX_MESSAGES_PER_SECOND = 50;

interface Member {
  profile: PlayerProfile;
  conn: Conn | null;
  /** Maior `seq` processado desde a conexão atual; vai no `ack` do tick. */
  lastSeq: number;
  ackDirty: boolean;
  leaveTimer: Timer | null;
  invalid: WindowCounter;
  rate: WindowCounter;
}

export interface RuntimeDeps {
  clock: Clock;
  scheduler: Scheduler;
}

/** Estado em memória de um coworking: jogadores, simulação e broadcast por tick. */
export class SpaceRuntime {
  private world: WorldState = { players: new Map() };
  private readonly members = new Map<string, Member>();
  private readonly moved = new Set<string>();
  private ticker: Timer | null = null;

  constructor(
    readonly spaceId: string,
    private readonly map: CompiledMap,
    private readonly mapVersion: number,
    private readonly deps: RuntimeDeps,
  ) {}

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
      desks: [],
    });
    this.ticker ??= this.deps.scheduler.setInterval(() => this.tick(), TICK_MS);
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
      default:
        this.send(conn, { t: 'error', code: 'not_implemented' });
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
