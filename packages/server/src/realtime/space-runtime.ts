import { randomUUID } from 'node:crypto';
import {
  CALL_RING_TIMEOUT_MS,
  CHAT_MAX_CHARS,
  CLOSE_POLICY,
  CLOSE_REMOVED,
  CLOSE_SESSION_REPLACED,
  ClientMsg,
  DIR_DELTA,
  KNOCK_TIMEOUT_MS,
  MAX_QUEUED_MOVES,
  MIN_STEP_INTERVAL_MS,
  RECONNECT_GRACE_MS,
  Recorder,
  TICK_MS,
  chatRecipients,
  encodeTick,
  withAck,
  relocate,
  step,
  zoneAt,
  type Activity,
  type CompiledDesk,
  type CompiledMap,
  type DeskState,
  type Dir,
  type Player,
  type Recording,
  type ReplayEvent,
  type ServerMsg,
  type SimPlayer,
  type StepRules,
  type ShortMove,
  type WorldState,
  type ZoneState,
} from '@pixelwork/shared';
import type { Metrics } from '../metrics.ts';
import type { PlayerProfile } from '../spaces/members.ts';
import { TokenBucket, WindowCounter, type Clock, type Scheduler, type Timer } from './clock.ts';
import { GameRegistry } from './games.ts';
import {
  PRIVATE_SOURCES,
  SPACE_SOURCES,
  callRoom,
  spaceRoom,
  zoneRoom,
  type MediaService,
} from './media.ts';

export interface Conn {
  /** Texto para as mensagens JSON; bytes para o tick binário. */
  send(data: string | Uint8Array): void;
  close(code: number, reason: string): void;
}

const INVALID_WINDOW_MS = 10_000;
const MAX_INVALID = 10;
const RATE_WINDOW_MS = 1_000;
const MAX_MESSAGES_PER_SECOND = 50;
const CHAT_BURST = 3;
const CHAT_PER_SECOND = 1;
/** Teto da gravação de replay por coworking (~1 MB em JSON); cheia, recomeça de um retrato. */
const MAX_REPLAY_EVENTS = 20_000;

interface Member {
  profile: PlayerProfile;
  /** Id curto do tick binário; liberado quando a pessoa sai do mapa. */
  short: number;
  conn: Conn | null;
  /** Maior `seq` decidido (aplicado ou recusado) desde a conexão atual; vai no `ack` do tick. */
  lastSeq: number;
  /** Maior `seq` recebido; os que chegaram cedo demais esperam em `queued`. */
  lastReceived: number;
  queued: { seq: number; dir: Dir }[];
  ackDirty: boolean;
  leaveTimer: Timer | null;
  invalid: WindowCounter;
  rate: WindowCounter;
  chat: TokenBucket;
  /** Zona onde estava no último movimento, para detectar entrada e saída. */
  zoneKey: string;
  /** Sala de mídia para a qual o cliente foi mandado por último. */
  mediaRoom: string | null;
  activity: Activity;
}

interface Lock {
  locked: boolean;
  /** Quem estava dentro na hora da tranca mais quem foi aprovado depois. */
  allowed: Set<string>;
}

interface Knock {
  zoneKey: string;
  from: string;
  timer: Timer;
}

interface Call {
  id: string;
  from: string;
  to: string;
  active: boolean;
  timer: Timer | null;
}

export interface RuntimeDeps {
  clock: Clock;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (obj: unknown, msg: string) => void };
  metrics?: Metrics;
}

/** Estado em memória de um coworking: jogadores, simulação, salas e chamadas. */
export class SpaceRuntime {
  private world: WorldState = { players: new Map() };
  private readonly members = new Map<string, Member>();
  private readonly moved = new Set<string>();
  private ticker: Timer | null = null;
  private readonly desks = new Map<string, DeskState>();
  private readonly locks = new Map<string, Lock>();
  private readonly knocks = new Map<string, Knock>();
  private readonly calls = new Map<string, Call>();
  private readonly rules: StepRules;
  private readonly recorder: Recorder;
  private readonly games: GameRegistry;

  constructor(
    readonly spaceId: string,
    private map: CompiledMap,
    private mapVersion: number,
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
    for (const zone of map.zones) {
      if (zone.type === 'meeting') this.locks.set(zone.key, { locked: false, allowed: new Set() });
    }
    this.rules = { canEnter: (id, x, y) => this.canEnter(id, x, y) };
    this.recorder = new Recorder(MAX_REPLAY_EVENTS, mapVersion, deps.clock.now());
    this.games = new GameRegistry(map.tables, {
      clock: deps.clock,
      scheduler: deps.scheduler,
      send: (userId, msg) => {
        const conn = this.members.get(userId)?.conn;
        if (conn) this.send(conn, msg);
      },
      broadcast: (msg) => this.broadcast(msg),
      activityChanged: (userId) => this.refresh(userId),
      observeFrame: (seconds) => deps.metrics?.gameFrame.observe(seconds),
    });
  }

  /** Gravação desde a última troca de mapa (ou desde que encheu), para o replay. */
  recording(): Recording {
    const current = this.recorder.current;
    return { ...current, events: [...current.events] };
  }

  private record(event: ReplayEvent): void {
    if (!this.recorder.push(event)) this.restartRecording();
  }

  private restartRecording(): void {
    this.recorder.restart(this.mapVersion, this.deps.clock.now(), this.world.players, this.locks);
  }

  private recordLock(zoneKey: string): void {
    const lock = this.locks.get(zoneKey);
    if (!lock) return;
    this.record({ t: this.deps.clock.now(), type: 'lock', zoneKey, locked: lock.locked, allowed: [...lock.allowed] });
  }

  /** Membros no mapa, incluindo quem está na tolerância de reconexão. */
  memberCount(): number {
    return this.members.size;
  }

  /** Partidas de pingpong com o laço de 30 Hz rodando. */
  activeGames(): number {
    return this.games.activeMatches();
  }

  /** Mapa compilado em uso (o replay reproduz sobre ele). */
  compiledMap(): CompiledMap {
    return this.map;
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
        short: this.allocateShort(),
        conn: null,
        lastSeq: 0,
        lastReceived: 0,
        queued: [],
        ackDirty: false,
        leaveTimer: null,
        invalid: new WindowCounter(clock, INVALID_WINDOW_MS, MAX_INVALID),
        rate: new WindowCounter(clock, RATE_WINDOW_MS, MAX_MESSAGES_PER_SECOND),
        chat: new TokenBucket(clock, CHAT_BURST, CHAT_PER_SECOND),
        zoneKey: zoneAt(this.map, this.map.spawn.x, this.map.spawn.y).key,
        mediaRoom: null,
        activity: 'idle',
      };
      this.members.set(profile.id, member);
      const players = new Map(this.world.players);
      const sim: SimPlayer = { ...this.map.spawn, dir: 'down', lastStepAt: -Infinity };
      players.set(profile.id, sim);
      this.world = { players };
      this.record({ t: clock.now(), type: 'join', id: profile.id, x: sim.x, y: sim.y, dir: sim.dir });
      member.activity = this.activityOf(profile.id);
      this.broadcast({ t: 'player.join', player: this.player(profile.id) }, profile.id);
    }

    // O cliente recomeça a contagem de seq a cada welcome.
    member.lastSeq = 0;
    member.lastReceived = 0;
    member.queued = [];
    member.ackDirty = false;
    member.conn = conn;
    // Conexão nova sempre recebe a sala atual, mesmo que seja a mesma de antes.
    member.mediaRoom = null;
    this.send(conn, {
      t: 'welcome',
      selfId: profile.id,
      mapVersion: this.mapVersion,
      players: [...this.members.keys()].map((id) => this.player(id)),
      zones: this.zoneStates(),
      desks: [...this.desks.values()],
      tables: this.games.states(),
      game: this.games.seatOf(profile.id),
    });
    this.ticker ??= this.deps.scheduler.setInterval(() => this.tick(), TICK_MS);
    this.games.reconnected(profile.id);
    this.syncMedia(profile.id);
  }

  onMessage(userId: string, conn: Conn, raw: string | null): void {
    const member = this.members.get(userId);
    if (member?.conn !== conn) return;
    if (member.rate.hit()) {
      conn.close(CLOSE_POLICY, 'rate limit');
      return;
    }

    const msg = raw === null ? null : parseClientMsg(raw);
    if (!msg || (msg.t === 'move' && msg.seq <= member.lastReceived)) {
      if (member.invalid.hit()) conn.close(CLOSE_POLICY, 'invalid messages');
      return;
    }

    switch (msg.t) {
      case 'move': {
        member.lastReceived = msg.seq;
        // Com a janela do jogo aberta as teclas são da raquete: o passo é confirmado sem andar.
        if (this.games.seatOf(userId)) {
          member.lastSeq = msg.seq;
          member.ackDirty = true;
          break;
        }
        member.queued.push({ seq: msg.seq, dir: msg.dir });
        // Fila cheia: o mais antigo é descartado e confirmado; o cliente corrige pelo ack.
        while (member.queued.length > MAX_QUEUED_MOVES) {
          const dropped = member.queued.shift();
          if (dropped) member.lastSeq = dropped.seq;
          member.ackDirty = true;
        }
        this.drainMoves(userId, member);
        break;
      }
      case 'ping':
        this.send(conn, { t: 'pong', id: msg.id, ts: this.deps.clock.now() });
        break;
      case 'chat.say':
        this.chat(userId, member, conn, msg.text);
        break;
      case 'zone.lock':
        this.lock(userId, conn, msg.zoneKey, msg.locked);
        break;
      case 'zone.knock':
        this.knock(userId, conn, msg.zoneKey);
        break;
      case 'zone.knockReply':
        this.knockReply(userId, msg.requestId, msg.allow);
        break;
      case 'call.invite':
        this.invite(userId, conn, msg.userId);
        break;
      case 'call.reply':
        this.reply(userId, msg.callId, msg.accept);
        break;
      case 'call.leave': {
        const call = this.callOf(userId);
        // Quem recebe e sai antes de atender está recusando; o resto é saída.
        if (call) this.endCall(call, !call.active && call.to === userId ? 'declined' : 'left');
        break;
      }
      case 'game.join': {
        const pos = this.world.players.get(userId);
        const error = pos ? this.games.join(userId, msg.tableKey, pos, Boolean(this.callOf(userId)?.active)) : 'table_not_at_side';
        if (error) this.send(conn, { t: 'error', code: error });
        break;
      }
      case 'game.bot':
        this.games.bot(userId);
        break;
      case 'game.rematch':
        this.games.rematch(userId);
        break;
      case 'game.leave':
        this.games.leave(userId);
        break;
      case 'game.input':
        this.games.input(userId, msg.seq, msg.dir);
        break;
    }
  }

  /**
   * Aplica os passos da fila que já respeitam o intervalo mínimo. O cliente anda a cada
   * `STEP_MS`, mas o jitter da rede junta dois passos; descartá-los puxava o avatar de volta.
   */
  private drainMoves(userId: string, member: Member): void {
    for (;;) {
      const next = member.queued[0];
      const player = this.world.players.get(userId);
      if (!next || !player) return;
      if (this.deps.clock.now() - player.lastStepAt < MIN_STEP_INTERVAL_MS) return;
      member.queued.shift();
      member.lastSeq = next.seq;
      member.ackDirty = true;
      this.record({ t: this.deps.clock.now(), type: 'step', id: userId, dir: next.dir });
      const result = step(
        this.world,
        [{ playerId: userId, seq: next.seq, dir: next.dir }],
        this.deps.clock.now(),
        this.map,
        this.rules,
      );
      this.world = result.state;
      for (const event of result.events) this.moved.add(event.id);
      this.afterMove(userId);
      // Passo recusado (parede, sala trancada) também conta: vira o avatar e marca o intervalo.
    }
  }

  onClose(userId: string, conn: Conn): void {
    const member = this.members.get(userId);
    if (member?.conn !== conn) return;
    member.conn = null;
    member.queued = [];
    // Desconexão encerra a chamada na hora; a tolerância só vale para a presença no mapa.
    const call = this.callOf(userId);
    if (call) this.endCall(call, 'left');
    this.games.disconnected(userId);
    member.leaveTimer = this.deps.scheduler.setTimeout(() => this.leave(userId), RECONNECT_GRACE_MS);
  }

  /** Menor id curto livre (u16); o tick binário identifica cada jogador por ele. */
  private allocateShort(): number {
    const used = new Set([...this.members.values()].map((m) => m.short));
    for (let n = 1; n <= 0xffff; n++) if (!used.has(n)) return n;
    throw new Error('ids curtos esgotados');
  }

  /** Envia a lista de quem se moveu, montada uma vez em binário; só o `ack` muda por cliente. */
  tick(): void {
    // Relógio de parede só para a métrica: a simulação continua no relógio injetado.
    const started = this.deps.metrics ? performance.now() : 0;
    for (const [id, member] of this.members) if (member.queued.length > 0) this.drainMoves(id, member);
    const moves: ShortMove[] = [];
    for (const id of this.moved) {
      const p = this.world.players.get(id);
      const short = this.members.get(id)?.short;
      if (p && short !== undefined) moves.push([short, p.x, p.y, p.dir]);
    }
    this.moved.clear();
    const frame = encodeTick(0, this.deps.clock.now(), moves);

    for (const member of this.members.values()) {
      if (!member.conn || (moves.length === 0 && !member.ackDirty)) continue;
      member.ackDirty = false;
      member.conn.send(withAck(frame, member.lastSeq));
    }
    this.deps.metrics?.tick.observe((performance.now() - started) / 1000);
  }

  close(): void {
    this.ticker?.cancel();
    this.ticker = null;
    this.games.close();
    for (const knock of this.knocks.values()) knock.timer.cancel();
    for (const call of this.calls.values()) call.timer?.cancel();
    for (const member of this.members.values()) {
      member.leaveTimer?.cancel();
      member.conn?.close(1001, 'server shutdown');
    }
    this.knocks.clear();
    this.calls.clear();
    this.members.clear();
    this.world = { players: new Map() };
  }

  /** Libera todas as mesas de uma vez (reset da demo) e avisa todos. */
  clearDesks(): void {
    for (const desk of this.desks.values()) {
      if (desk.userId) this.setDesk({ deskKey: desk.deskKey, userId: null, ownerName: null, decor: null });
    }
  }

  // ---- troca de mapa ----

  /**
   * Mapa novo gravado: realoca quem ficou em tile bloqueado, limpa trancas e batidas de zonas
   * que sumiram, encerra as salas de mídia delas e avisa todos com map.updated.
   */
  replaceMap(map: CompiledMap, version: number): void {
    const meetingKeys = new Set(map.zones.filter((z) => z.type === 'meeting').map((z) => z.key));
    const removed = [...this.locks.keys()].filter((key) => !meetingKeys.has(key));
    for (const [requestId, knock] of this.knocks) {
      if (removed.includes(knock.zoneKey)) this.resolveKnock(requestId, false);
    }
    for (const key of removed) this.locks.delete(key);
    for (const key of meetingKeys) if (!this.locks.has(key)) this.locks.set(key, { locked: false, allowed: new Set() });

    const deskKeys = new Set(map.desks.map((d) => d.key));
    for (const key of [...this.desks.keys()]) if (!deskKeys.has(key)) this.desks.delete(key);
    for (const key of deskKeys) {
      if (!this.desks.has(key)) this.desks.set(key, { deskKey: key, userId: null, ownerName: null, decor: null });
    }

    this.map = map;
    this.mapVersion = version;
    // Antes do refresh dos jogadores abaixo: quem jogava volta a 'idle'.
    this.games.replaceTables(map.tables);
    const players = new Map(this.world.players);
    for (const [id, p] of players) {
      let to = relocate(map, p.x, p.y);
      // Zona redesenhada por cima de alguém não fura a tranca: quem não estava dentro nem foi
      // liberado vai para o spawn (que o compileMap garante fora de sala de reunião).
      const zone = zoneAt(map, to.x, to.y);
      const lock = this.locks.get(zone.key);
      if (lock?.locked && !lock.allowed.has(id) && this.members.get(id)?.zoneKey !== zone.key) to = map.spawn;
      if (to.x === p.x && to.y === p.y) continue;
      players.set(id, { ...p, x: to.x, y: to.y });
      this.moved.add(id);
    }
    this.world = { players };

    this.broadcast({ t: 'map.updated', version });
    for (const [id, member] of this.members) {
      const p = this.world.players.get(id);
      if (p) member.zoneKey = zoneAt(map, p.x, p.y).key;
      this.refresh(id);
    }
    // Sala que ficou vazia com a troca destranca, como quando o último sai andando.
    for (const key of this.locks.keys()) this.zoneChanged(key);
    // Mapa novo, gravação nova: o replay reproduz sobre um mapa só.
    this.restartRecording();
    // Quem estava numa zona removida já foi mandado para outra sala; a sala antiga fecha.
    for (const key of removed) {
      this.deps.media.deleteRoom(zoneRoom(this.spaceId, key)).catch((error: unknown) => {
        this.deps.log.error({ error, zoneKey: key }, 'falha ao encerrar a sala de mídia da zona removida');
      });
    }
  }

  // ---- zonas de reunião ----

  /** Ponto de extensão da simulação: sala trancada só para quem está na lista. */
  private canEnter(userId: string, x: number, y: number): boolean {
    const zone = zoneAt(this.map, x, y);
    const lock = this.locks.get(zone.key);
    if (!lock?.locked) return true;
    return lock.allowed.has(userId) || this.members.get(userId)?.zoneKey === zone.key;
  }

  private occupants(zoneKey: string): string[] {
    const ids: string[] = [];
    for (const [id, p] of this.world.players) {
      if (zoneAt(this.map, p.x, p.y).key === zoneKey) ids.push(id);
    }
    return ids;
  }

  private zoneState(zoneKey: string): ZoneState {
    const lock = this.locks.get(zoneKey);
    return { zoneKey, locked: lock?.locked ?? false, occupants: this.occupants(zoneKey) };
  }

  private zoneStates(): ZoneState[] {
    return [...this.locks.keys()].map((key) => this.zoneState(key));
  }

  /** Entrada e saída de zona: estado da sala, destranca automática, atividade e sala de mídia. */
  private afterMove(userId: string): void {
    const member = this.members.get(userId);
    const p = this.world.players.get(userId);
    if (!member || !p) return;
    const zoneKey = zoneAt(this.map, p.x, p.y).key;
    if (zoneKey === member.zoneKey) return;
    const previous = member.zoneKey;
    member.zoneKey = zoneKey;
    this.zoneChanged(previous);
    this.zoneChanged(zoneKey);
    this.refresh(userId);
  }

  private zoneChanged(zoneKey: string): void {
    const lock = this.locks.get(zoneKey);
    if (!lock) return;
    if (lock.locked && this.occupants(zoneKey).length === 0) {
      lock.locked = false;
      lock.allowed.clear();
      this.recordLock(zoneKey);
      for (const [requestId, knock] of this.knocks) {
        if (knock.zoneKey === zoneKey) this.resolveKnock(requestId, false);
      }
    }
    this.broadcast({ t: 'zone.state', zone: this.zoneState(zoneKey) });
  }

  private lock(userId: string, conn: Conn, zoneKey: string, locked: boolean): void {
    const lock = this.locks.get(zoneKey);
    if (!lock || this.members.get(userId)?.zoneKey !== zoneKey) {
      this.send(conn, { t: 'error', code: 'not_in_zone' });
      return;
    }
    lock.locked = locked;
    lock.allowed = locked ? new Set(this.occupants(zoneKey)) : new Set();
    this.recordLock(zoneKey);
    this.broadcast({ t: 'zone.state', zone: this.zoneState(zoneKey) });
  }

  private knock(userId: string, conn: Conn, zoneKey: string): void {
    const lock = this.locks.get(zoneKey);
    const p = this.world.players.get(userId);
    if (!lock || !p) {
      this.send(conn, { t: 'error', code: 'not_at_door' });
      return;
    }
    if (!lock.locked) {
      this.send(conn, { t: 'error', code: 'not_locked' });
      return;
    }
    const inside = zoneAt(this.map, p.x, p.y).key === zoneKey;
    const atDoor = Object.values(DIR_DELTA).some(
      ([dx, dy]) => zoneAt(this.map, p.x + dx, p.y + dy).key === zoneKey,
    );
    if (inside || !atDoor) {
      this.send(conn, { t: 'error', code: 'not_at_door' });
      return;
    }
    if ([...this.knocks.values()].some((k) => k.from === userId && k.zoneKey === zoneKey)) return;

    const requestId = randomUUID();
    const timer = this.deps.scheduler.setTimeout(() => this.resolveKnock(requestId, false), KNOCK_TIMEOUT_MS);
    this.knocks.set(requestId, { zoneKey, from: userId, timer });
    const data = JSON.stringify({ t: 'zone.knockRequest', requestId, zoneKey, from: userId } satisfies ServerMsg);
    for (const id of this.occupants(zoneKey)) this.members.get(id)?.conn?.send(data);
  }

  /** A primeira resposta de um ocupante vale; as seguintes encontram o pedido já resolvido. */
  private knockReply(userId: string, requestId: string, allow: boolean): void {
    const knock = this.knocks.get(requestId);
    if (!knock || this.members.get(userId)?.zoneKey !== knock.zoneKey) return;
    this.resolveKnock(requestId, allow);
  }

  private resolveKnock(requestId: string, allow: boolean): void {
    const knock = this.knocks.get(requestId);
    if (!knock) return;
    this.knocks.delete(requestId);
    knock.timer.cancel();
    const lock = this.locks.get(knock.zoneKey);
    const allowed = allow && lock?.locked === true;
    if (allowed) {
      lock.allowed.add(knock.from);
      this.recordLock(knock.zoneKey);
    }
    const conn = this.members.get(knock.from)?.conn;
    if (conn) this.send(conn, { t: 'zone.knockResult', zoneKey: knock.zoneKey, allowed });
  }

  // ---- chamadas ----

  private callOf(userId: string): Call | undefined {
    for (const call of this.calls.values()) if (call.from === userId || call.to === userId) return call;
    return undefined;
  }

  /** Sentado = no tile da cadeira da própria mesa. */
  private isSeated(userId: string): boolean {
    const p = this.world.players.get(userId);
    if (!p) return false;
    return this.map.desks.some(
      (d) => d.chairX === p.x && d.chairY === p.y && this.desks.get(d.key)?.userId === userId,
    );
  }

  private invite(userId: string, conn: Conn, target: string): void {
    if (!this.isSeated(userId)) {
      this.send(conn, { t: 'error', code: 'not_seated' });
      return;
    }
    if (target === userId || !this.members.get(target)?.conn) {
      this.send(conn, { t: 'error', code: 'call_unavailable' });
      return;
    }
    if (this.callOf(userId)) {
      this.send(conn, { t: 'error', code: 'already_in_call' });
      return;
    }
    const id = randomUUID();
    if (this.callOf(target) || this.activityOf(target) === 'meeting' || this.games.seatOf(target)) {
      this.send(conn, { t: 'call.ended', callId: id, reason: 'busy' });
      return;
    }
    const call: Call = { id, from: userId, to: target, active: false, timer: null };
    call.timer = this.deps.scheduler.setTimeout(() => this.endCall(call, 'timeout'), CALL_RING_TIMEOUT_MS);
    this.calls.set(id, call);
    const targetConn = this.members.get(target)?.conn;
    if (targetConn) this.send(targetConn, { t: 'call.incoming', callId: id, from: userId });
  }

  private reply(userId: string, callId: string, accept: boolean): void {
    const call = this.calls.get(callId);
    if (call?.to !== userId || call.active) return;
    if (!accept) {
      this.endCall(call, 'declined');
      return;
    }
    call.timer?.cancel();
    call.timer = null;
    call.active = true;
    this.refresh(call.from);
    this.refresh(call.to);
  }

  /** Encerra para os dois; cada um volta para a sala onde está no mapa. */
  private endCall(call: Call, reason: 'declined' | 'left' | 'timeout'): void {
    if (!this.calls.delete(call.id)) return;
    call.timer?.cancel();
    const msg: ServerMsg = { t: 'call.ended', callId: call.id, reason };
    for (const id of [call.from, call.to]) {
      const conn = this.members.get(id)?.conn;
      if (conn) this.send(conn, msg);
      this.refresh(id);
    }
  }

  // ---- atividade e mídia ----

  private activityOf(userId: string): Activity {
    if (this.callOf(userId)?.active) return 'call';
    if (this.games.seatOf(userId)) return 'game';
    const p = this.world.players.get(userId);
    if (p && zoneAt(this.map, p.x, p.y).type === 'meeting') return 'meeting';
    return 'idle';
  }

  /** Recalcula atividade (avisando todos) e sala de mídia de um jogador. */
  private refresh(userId: string): void {
    const member = this.members.get(userId);
    if (!member) return;
    const activity = this.activityOf(userId);
    if (activity !== member.activity) {
      member.activity = activity;
      this.broadcast({ t: 'player.update', id: userId, patch: { activity } });
    }
    this.syncMedia(userId);
  }

  private mediaRoomOf(userId: string): string {
    const call = this.callOf(userId);
    if (call?.active) return callRoom(call.id);
    const p = this.world.players.get(userId);
    const zone = p ? zoneAt(this.map, p.x, p.y) : undefined;
    if (zone?.type === 'meeting') return zoneRoom(this.spaceId, zone.key);
    return spaceRoom(this.spaceId);
  }

  /**
   * Quem decide a sala é o servidor (invariante 3). Ao trocar, emite o token da sala nova e
   * tira o participante da anterior pela API do LiveKit, para o caso de o cliente ignorar o aviso.
   * Vale também para a sala aberta: sem isso, um cliente modificado ficaria nela durante uma
   * reunião ou chamada.
   */
  private syncMedia(userId: string): void {
    const member = this.members.get(userId);
    if (!member) return;
    const room = this.mediaRoomOf(userId);
    if (room === member.mediaRoom) return;
    const previous = member.mediaRoom;
    member.mediaRoom = room;
    if (previous) this.removeFromRoom(previous, userId);
    const conn = member.conn;
    if (conn) void this.sendMediaJoin(userId, conn, room);
  }

  private removeFromRoom(room: string, userId: string): void {
    this.deps.media.removeParticipant(room, userId).catch((error: unknown) => {
      // Quem já saiu da sala por conta própria dá "não encontrado" no LiveKit; não muda nada.
      if (!isNotFound(error)) this.deps.log.error({ error, userId, room }, 'falha ao remover da sala de mídia');
    });
  }

  private async sendMediaJoin(userId: string, conn: Conn, room: string): Promise<void> {
    const sources = room === spaceRoom(this.spaceId) ? SPACE_SOURCES : PRIVATE_SOURCES;
    try {
      const token = await this.deps.media.token(userId, room, sources);
      if (this.deps.metrics) this.deps.metrics.mediaTokens++;
      // A sala pode ter mudado de novo, ou a conexão caído, enquanto o token era assinado.
      const member = this.members.get(userId);
      if (member?.conn !== conn || member.mediaRoom !== room) return;
      this.send(conn, { t: 'media.join', room, token, url: this.deps.media.url });
    } catch (error) {
      this.deps.log.error({ error, userId, room }, 'falha ao emitir token de mídia');
    }
  }

  // ---- chat ----

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

  // ---- presença ----

  /** Saiu do coworking (removido ou por conta própria): fecha a conexão e sai do mapa sem tolerância. */
  removeMember(userId: string): void {
    const member = this.members.get(userId);
    for (const desk of this.desks.values()) {
      if (desk.userId === userId) this.setDesk({ deskKey: desk.deskKey, userId: null, ownerName: null, decor: null });
    }
    if (!member) return;
    member.leaveTimer?.cancel();
    const conn = member.conn;
    member.conn = null;
    conn?.close(CLOSE_REMOVED, 'removed');
    this.leave(userId);
  }

  private leave(userId: string): void {
    const member = this.members.get(userId);
    if (!member) return;
    const call = this.callOf(userId);
    if (call) this.endCall(call, 'left');
    for (const [requestId, knock] of this.knocks) {
      if (knock.from === userId) this.resolveKnock(requestId, false);
    }
    // Saiu do mapa (fim da tolerância de reconexão): desistência na mesa em que estava.
    this.games.leave(userId);
    if (member.mediaRoom) this.removeFromRoom(member.mediaRoom, userId);
    this.members.delete(userId);
    const players = new Map(this.world.players);
    players.delete(userId);
    this.world = { players };
    this.record({ t: this.deps.clock.now(), type: 'leave', id: userId });
    this.moved.delete(userId);
    this.broadcast({ t: 'player.leave', id: userId });
    this.zoneChanged(member.zoneKey);
    if (this.members.size === 0) {
      this.ticker?.cancel();
      this.ticker = null;
    }
  }

  private player(id: string): Player {
    const member = this.members.get(id);
    const sim = this.world.players.get(id);
    if (!member || !sim) throw new Error(`jogador ${id} sem estado`);
    return { ...member.profile, n: member.short, x: sim.x, y: sim.y, dir: sim.dir, activity: member.activity };
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

/** Erro do LiveKit (ServerError do SDK) para participante ou sala inexistente. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return code === 'not_found' || status === 404;
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
