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
  canReachFurnitureSeat,
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
import { ReceptionRuntime, type ReceptionRuntimeDeps, type ReceptionVisitor } from './reception-runtime.ts';
import { readReceptionTool } from './reception-tools.ts';
import {
  PRIVATE_SOURCES,
  SPACE_SOURCES,
  callRoom,
  spaceRoom,
  zoneRoom,
  type MediaService,
} from './media.ts';

/** Conexão de um cliente vista pelo runtime; o gateway cuida do WebSocket por trás. */
export interface Conn {
  /** Texto para as mensagens JSON; bytes para o tick binário. */
  send(payload: string | Uint8Array): void;
  close(code: number, reason: string): void;
}

// Limites por conexão: mensagens inválidas em 10 s, mensagens em geral por segundo e rajada do chat.
const INVALID_WINDOW_MS = 10_000;
const MAX_INVALID = 10;
const RATE_WINDOW_MS = 1_000;
const MAX_MESSAGES_PER_SECOND = 50;
const CHAT_BURST = 3;
const CHAT_PER_SECOND = 1;
/** Teto da gravação de replay por coworking (~1 MB em JSON); cheia, recomeça de um retrato. */
const MAX_REPLAY_EVENTS = 20_000;

/** Quem está no mapa deste coworking, conectado ou dentro da tolerância de reconexão. */
interface Member {
  profile: PlayerProfile;
  /** Id curto do tick binário; liberado quando a pessoa sai do mapa. */
  shortId: number;
  /** Null enquanto a pessoa está desconectada, dentro da tolerância de reconexão. */
  connection: Conn | null;
  /** Maior `seq` decidido (aplicado ou recusado) desde a conexão atual; vai no `ack` do tick. */
  lastSeq: number;
  /** Maior `seq` recebido; os que chegaram cedo demais esperam em `queued`. */
  lastReceived: number;
  queued: { seq: number; dir: Dir }[];
  /** O `ack` mudou e precisa ir no próximo tick mesmo sem ninguém ter andado. */
  ackDirty: boolean;
  /** Fim da tolerância de reconexão; ao disparar, a pessoa sai do mapa. */
  leaveTimer: Timer | null;
  invalidMessages: WindowCounter;
  messageRate: WindowCounter;
  chatBucket: TokenBucket;
  /** Zona onde estava no último movimento, para detectar entrada e saída. */
  zoneKey: string;
  /** Sala de mídia para a qual o cliente foi mandado por último. */
  mediaRoom: string | null;
  activity: Activity;
}

/** Tranca de uma sala de reunião. */
interface Lock {
  locked: boolean;
  /** Quem estava dentro na hora da tranca mais quem foi aprovado depois. */
  allowed: Set<string>;
}

/** Batida na porta de uma sala trancada, esperando resposta de quem está dentro. */
interface Knock {
  zoneKey: string;
  /** Quem bateu. */
  from: string;
  timer: Timer;
}

/** Chamada 1x1 entre mesas: toca até ser atendida (active) ou o tempo acabar. */
interface Call {
  id: string;
  from: string;
  to: string;
  active: boolean;
  /** Tempo de toque; cancelado quando a chamada é atendida. */
  timer: Timer | null;
}

export interface RuntimeDeps {
  clock: Clock;
  scheduler: Scheduler;
  media: MediaService;
  log: { error: (details: unknown, message: string) => void };
  metrics?: Metrics;
  reception?: ReceptionRuntimeDeps;
}

/** Estado em memória de um coworking: jogadores, simulação, salas e chamadas. */
export class SpaceRuntime {
  private world: WorldState = { players: new Map() };
  private readonly members = new Map<string, Member>();
  /** Jogadores que andaram desde o último tick; só eles vão no próximo. */
  private readonly movedSinceTick = new Set<string>();
  private ticker: Timer | null = null;
  private readonly desks = new Map<string, DeskState>();
  private readonly seatedOnFurniture = new Map<string, string>();
  private readonly locks = new Map<string, Lock>();
  private readonly knocks = new Map<string, Knock>();
  private readonly calls = new Map<string, Call>();
  private readonly rules: StepRules;
  private readonly recorder: Recorder;
  private readonly games: GameRegistry;
  private readonly reception?: ReceptionRuntime;

  constructor(
    readonly spaceId: string,
    private map: CompiledMap,
    private mapVersion: number,
    private readonly deps: RuntimeDeps,
    assignments: readonly DeskState[] = [],
    receptionEnabled = false,
  ) {
    if (deps.reception) {
      this.reception = new ReceptionRuntime(spaceId, map, receptionEnabled, deps.reception,
        (reception) => this.broadcast({ t: 'reception.state', reception }),
        (input, visitor) => readReceptionTool({
          map: this.map,
          online: [...this.members.entries()].flatMap(([id, member]) => {
            const pos = this.positionOf(id);
            return member.connection && pos ? [{ ...pos, id, name: member.profile.name, activity: member.activity }] : [];
          }),
          isLocked: (key) => this.locks.get(key)?.locked ?? false,
        }, input, (destination) => visitor.send({ t: 'reception.destination', destination })));
    }
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
    // A simulação compartilhada pergunta ao runtime se o tile pode ser ocupado (salas trancadas).
    this.rules = { canEnter: (id, x, y) => this.canEnter(id, x, y) };
    this.recorder = new Recorder(MAX_REPLAY_EVENTS, mapVersion, deps.clock.now());
    this.games = new GameRegistry(map.tables, {
      clock: deps.clock,
      scheduler: deps.scheduler,
      send: (userId, message) => {
        const connection = this.members.get(userId)?.connection;
        if (connection) this.send(connection, message);
      },
      broadcast: (message) => this.broadcast(message),
      activityChanged: (userId) => this.refresh(userId),
      observeFrame: (seconds) => deps.metrics?.gameFrame.observe(seconds),
    });
  }

  /** Gravação desde a última troca de mapa (ou desde que encheu), para o replay. */
  recording(): Recording {
    const current = this.recorder.current;
    return { ...current, events: [...current.events] };
  }

  /** Grava no replay; com a gravação cheia, recomeça de um retrato do estado atual. */
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
    return this.map.desks.find((desk) => desk.key === deskKey);
  }

  /** Posição autoritativa de quem está conectado agora. */
  positionOf(userId: string): { x: number; y: number } | null {
    if (!this.members.get(userId)?.connection) return null;
    const player = this.world.players.get(userId);
    return player ? { x: player.x, y: player.y } : null;
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

  /**
   * Conexão nova de um membro. Se ele ainda está no mapa (outra aba ou volta dentro da
   * tolerância), mantém posição e id curto e derruba a conexão anterior; senão entra no spawn.
   * Em ambos os casos manda o `welcome` com o estado inteiro do coworking.
   */
  connect(profile: PlayerProfile, connection: Conn): void {
    const { clock } = this.deps;
    let member = this.members.get(profile.id);

    if (member) {
      const previousConnection = member.connection;
      if (previousConnection) {
        member.connection = null;
        previousConnection.send(JSON.stringify({ t: 'session.replaced' } satisfies ServerMsg));
        previousConnection.close(CLOSE_SESSION_REPLACED, 'session replaced');
      }
      member.leaveTimer?.cancel();
      member.leaveTimer = null;
      member.profile = profile;
    } else {
      member = {
        profile,
        shortId: this.allocateShort(),
        connection: null,
        lastSeq: 0,
        lastReceived: 0,
        queued: [],
        ackDirty: false,
        leaveTimer: null,
        invalidMessages: new WindowCounter(clock, INVALID_WINDOW_MS, MAX_INVALID),
        messageRate: new WindowCounter(clock, RATE_WINDOW_MS, MAX_MESSAGES_PER_SECOND),
        chatBucket: new TokenBucket(clock, CHAT_BURST, CHAT_PER_SECOND),
        zoneKey: zoneAt(this.map, this.map.spawn.x, this.map.spawn.y).key,
        mediaRoom: null,
        activity: 'idle',
      };
      this.members.set(profile.id, member);
      // O mundo da simulação é imutável: cada mudança troca o Map inteiro.
      const players = new Map(this.world.players);
      const spawnedPlayer: SimPlayer = { ...this.map.spawn, dir: 'down', lastStepAt: -Infinity };
      players.set(profile.id, spawnedPlayer);
      this.world = { players };
      this.record({ t: clock.now(), type: 'join', id: profile.id, x: spawnedPlayer.x, y: spawnedPlayer.y, dir: spawnedPlayer.dir });
      member.activity = this.activityOf(profile.id);
      this.broadcast({ t: 'player.join', player: this.player(profile.id) }, profile.id);
    }

    // O cliente recomeça a contagem de seq a cada welcome.
    member.lastSeq = 0;
    member.lastReceived = 0;
    member.queued = [];
    member.ackDirty = false;
    this.reception?.stopFor(profile.id, 'left');
    member.connection = connection;
    const reception = this.reception?.presence();
    // Conexão nova sempre recebe a sala atual, mesmo que seja a mesma de antes.
    member.mediaRoom = null;
    this.send(connection, {
      t: 'welcome',
      selfId: profile.id,
      mapVersion: this.mapVersion,
      players: [...this.members.keys()].map((id) => this.player(id)),
      zones: this.zoneStates(),
      desks: [...this.desks.values()],
      tables: this.games.states(),
      game: this.games.seatOf(profile.id),
      ...(reception ? { reception } : {}),
    });
    // O tick só roda com alguém no mapa; o último a sair o desliga (leave).
    this.ticker ??= this.deps.scheduler.setInterval(() => this.tick(), TICK_MS);
    this.games.reconnected(profile.id);
    this.syncMedia(profile.id);
  }

  /**
   * Mensagem do cliente. Conexão substituída é ignorada; excesso de mensagens ou de mensagens
   * inválidas fecha a conexão por política. `rawMessage` null é mensagem binária (inválida).
   */
  onMessage(userId: string, connection: Conn, rawMessage: string | null): void {
    const member = this.members.get(userId);
    if (member?.connection !== connection) return;
    if (member.messageRate.hit()) {
      connection.close(CLOSE_POLICY, 'rate limit');
      return;
    }

    const message = rawMessage === null ? null : parseClientMsg(rawMessage);
    // `seq` de movimento repetido ou fora de ordem conta como inválido.
    if (!message || (message.t === 'move' && message.seq <= member.lastReceived)) {
      if (member.invalidMessages.hit()) connection.close(CLOSE_POLICY, 'invalid messages');
      return;
    }

    switch (message.t) {
      case 'move': {
        member.lastReceived = message.seq;
        // Com a janela do jogo aberta as teclas são da raquete: o passo é confirmado sem andar.
        if (this.games.seatOf(userId)) {
          member.lastSeq = message.seq;
          member.ackDirty = true;
          break;
        }
        member.queued.push({ seq: message.seq, dir: message.dir });
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
        this.send(connection, { t: 'pong', id: message.id, ts: this.deps.clock.now() });
        break;
      case 'chat.say':
        this.sendChat(userId, member, connection, message.text);
        break;
      case 'zone.lock':
        this.setZoneLock(userId, connection, message.zoneKey, message.locked);
        break;
      case 'zone.knock':
        this.knockOnZone(userId, connection, message.zoneKey);
        break;
      case 'zone.knockReply':
        this.knockReply(userId, message.requestId, message.allow);
        break;
      case 'call.invite':
        this.inviteToCall(userId, connection, message.userId);
        break;
      case 'call.reply':
        this.answerCall(userId, message.callId, message.accept);
        break;
      case 'reception.start': {
        const visitor = this.receptionVisitor(userId, connection);
        if (visitor && this.reception) this.reception.start(visitor);
        else this.send(connection, { t: 'reception.session', state: 'ended', reason: 'unavailable' });
        break;
      }
      case 'reception.stop':
        this.reception?.stopFor(userId, 'finished');
        break;
      case 'call.leave': {
        const call = this.callOf(userId);
        // Quem recebe e sai antes de atender está recusando; o resto é saída.
        if (call) this.endCall(call, !call.active && call.to === userId ? 'declined' : 'left');
        break;
      }
      case 'furniture.sit': {
        const error = this.sitOnFurniture(userId, message.seatKey);
        if (error) this.send(connection, { t: 'error', code: error });
        break;
      }
      case 'furniture.stand':
        this.standFromFurniture(userId);
        break;
      case 'game.join': {
        // Quem está em chamada atendida não senta para jogar.
        const position = this.world.players.get(userId);
        const error = position ? this.games.join(userId, message.tableKey, position, Boolean(this.callOf(userId)?.active)) : 'table_not_at_side';
        if (error) this.send(connection, { t: 'error', code: error });
        else this.standFromFurniture(userId);
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
      case 'game.kick':
        this.games.kick(userId);
        break;
      case 'game.input':
        this.games.input(userId, message.seq, message.dir);
        break;
    }
  }

  /**
   * Aplica os passos da fila que já respeitam o intervalo mínimo. O cliente anda a cada
   * `STEP_MS`, mas o jitter da rede junta dois passos; descartá-los puxava o avatar de volta.
   */
  private drainMoves(userId: string, member: Member): void {
    for (;;) {
      const nextMove = member.queued[0];
      const player = this.world.players.get(userId);
      if (!nextMove || !player) return;
      if (this.deps.clock.now() - player.lastStepAt < MIN_STEP_INTERVAL_MS) return;
      member.queued.shift();
      member.lastSeq = nextMove.seq;
      member.ackDirty = true;
      this.record({ t: this.deps.clock.now(), type: 'step', id: userId, dir: nextMove.dir });
      const result = step(
        this.world,
        [{ playerId: userId, seq: nextMove.seq, dir: nextMove.dir }],
        this.deps.clock.now(),
        this.map,
        this.rules,
      );
      this.world = result.state;
      const next = this.world.players.get(userId);
      if (next && (next.x !== player.x || next.y !== player.y)) this.standFromFurniture(userId);
      for (const event of result.events) this.movedSinceTick.add(event.id);
      this.afterMove(userId);
      // Passo recusado (parede, sala trancada) também conta: vira o avatar e marca o intervalo.
    }
  }

  private sitOnFurniture(userId: string, seatKey: string): 'furniture_seat_unavailable' | 'furniture_seat_taken' | null {
    const player = this.world.players.get(userId);
    const seat = this.map.furnitureSeats.find((candidate) => candidate.key === seatKey);
    if (!player || !seat || this.games.seatOf(userId) || !canReachFurnitureSeat(seat, player.x, player.y)) {
      return 'furniture_seat_unavailable';
    }
    if (this.seatedOnFurniture.get(userId) === seatKey) return null;
    if ([...this.seatedOnFurniture.values()].includes(seatKey)) return 'furniture_seat_taken';
    this.seatedOnFurniture.set(userId, seatKey);
    this.broadcast({ t: 'player.update', id: userId, patch: { seatedAt: seatKey } });
    return null;
  }

  private standFromFurniture(userId: string): void {
    if (this.seatedOnFurniture.delete(userId)) this.broadcast({ t: 'player.update', id: userId, patch: { seatedAt: null } });
  }

  /** Conexão fechou: a pessoa fica no mapa até o fim da tolerância de reconexão. */
  onClose(userId: string, connection: Conn): void {
    const member = this.members.get(userId);
    if (member?.connection !== connection) return;
    member.connection = null;
    member.queued = [];
    this.reception?.stopFor(userId, 'left');
    // Desconexão encerra a chamada na hora; a tolerância só vale para a presença no mapa.
    const call = this.callOf(userId);
    if (call) this.endCall(call, 'left');
    this.games.disconnected(userId);
    member.leaveTimer = this.deps.scheduler.setTimeout(() => this.leave(userId), RECONNECT_GRACE_MS);
  }

  /** Menor id curto livre (u16); o tick binário identifica cada jogador por ele. */
  private allocateShort(): number {
    const usedShortIds = new Set([...this.members.values()].map((member) => member.shortId));
    for (let candidate = 1; candidate <= 0xffff; candidate++) if (!usedShortIds.has(candidate)) return candidate;
    throw new Error('ids curtos esgotados');
  }

  /** Envia a lista de quem se moveu, montada uma vez em binário; só o `ack` muda por cliente. */
  tick(): void {
    // Relógio de parede só para a métrica: a simulação continua no relógio injetado.
    const tickStartedAt = this.deps.metrics ? performance.now() : 0;
    // Passos que estavam esperando o intervalo mínimo entram antes de montar o quadro.
    for (const [id, member] of this.members) if (member.queued.length > 0) this.drainMoves(id, member);
    const moves: ShortMove[] = [];
    for (const id of this.movedSinceTick) {
      const player = this.world.players.get(id);
      const shortId = this.members.get(id)?.shortId;
      if (player && shortId !== undefined) moves.push([shortId, player.x, player.y, player.dir]);
    }
    this.movedSinceTick.clear();
    const tickFrame = encodeTick(0, this.deps.clock.now(), moves);

    // Sem movimento e sem ack novo, o cliente não recebe nada neste tick.
    for (const member of this.members.values()) {
      if (!member.connection || (moves.length === 0 && !member.ackDirty)) continue;
      member.ackDirty = false;
      member.connection.send(withAck(tickFrame, member.lastSeq));
    }
    this.deps.metrics?.tick.observe((performance.now() - tickStartedAt) / 1000);
  }

  /** Descarrega o runtime: cancela todos os timers e fecha as conexões (1001). */
  close(): void {
    this.ticker?.cancel();
    this.ticker = null;
    this.games.close();
    this.reception?.stop('unavailable');
    for (const knock of this.knocks.values()) knock.timer.cancel();
    for (const call of this.calls.values()) call.timer?.cancel();
    for (const member of this.members.values()) {
      member.leaveTimer?.cancel();
      member.connection?.close(1001, 'server shutdown');
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
    const meetingKeys = new Set(map.zones.filter((zone) => zone.type === 'meeting').map((zone) => zone.key));
    const removedZoneKeys = [...this.locks.keys()].filter((zoneKey) => !meetingKeys.has(zoneKey));
    for (const [requestId, knock] of this.knocks) {
      if (removedZoneKeys.includes(knock.zoneKey)) this.resolveKnock(requestId, false);
    }
    for (const zoneKey of removedZoneKeys) this.locks.delete(zoneKey);
    for (const zoneKey of meetingKeys) if (!this.locks.has(zoneKey)) this.locks.set(zoneKey, { locked: false, allowed: new Set() });

    // Mesas que sumiram saem; mesas novas entram livres.
    const deskKeys = new Set(map.desks.map((desk) => desk.key));
    for (const deskKey of [...this.desks.keys()]) if (!deskKeys.has(deskKey)) this.desks.delete(deskKey);
    for (const deskKey of deskKeys) {
      if (!this.desks.has(deskKey)) this.desks.set(deskKey, { deskKey, userId: null, ownerName: null, decor: null });
    }

    for (const id of this.seatedOnFurniture.keys()) this.standFromFurniture(id);
    this.map = map;
    this.mapVersion = version;
    this.reception?.replaceMap(map);
    // Antes do refresh dos jogadores abaixo: quem jogava volta a 'idle'.
    this.games.replaceTables(map.tables);
    const players = new Map(this.world.players);
    for (const [id, player] of players) {
      let destination = relocate(map, player.x, player.y);
      // Zona redesenhada por cima de alguém não fura a tranca: quem não estava dentro nem foi
      // liberado vai para o spawn (que o compileMap garante fora de sala de reunião).
      const zone = zoneAt(map, destination.x, destination.y);
      const lock = this.locks.get(zone.key);
      if (lock?.locked && !lock.allowed.has(id) && this.members.get(id)?.zoneKey !== zone.key) destination = map.spawn;
      if (destination.x === player.x && destination.y === player.y) continue;
      players.set(id, { ...player, x: destination.x, y: destination.y });
      this.movedSinceTick.add(id);
    }
    this.world = { players };

    this.broadcast({ t: 'map.updated', version });
    for (const [id, member] of this.members) {
      const player = this.world.players.get(id);
      if (player) member.zoneKey = zoneAt(map, player.x, player.y).key;
      this.refresh(id);
    }
    // Sala que ficou vazia com a troca destranca, como quando o último sai andando.
    for (const zoneKey of this.locks.keys()) this.zoneChanged(zoneKey);
    // Mapa novo, gravação nova: o replay reproduz sobre um mapa só.
    this.restartRecording();
    // Quem estava numa zona removida já foi mandado para outra sala; a sala antiga fecha.
    for (const zoneKey of removedZoneKeys) {
      this.deps.media.deleteRoom(zoneRoom(this.spaceId, zoneKey)).catch((error: unknown) => {
        this.deps.log.error({ error, zoneKey }, 'falha ao encerrar a sala de mídia da zona removida');
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

  /** Ids de quem está dentro da zona agora, pela posição na simulação. */
  private occupants(zoneKey: string): string[] {
    const occupantIds: string[] = [];
    for (const [id, player] of this.world.players) {
      if (zoneAt(this.map, player.x, player.y).key === zoneKey) occupantIds.push(id);
    }
    return occupantIds;
  }

  private zoneState(zoneKey: string): ZoneState {
    const lock = this.locks.get(zoneKey);
    return { zoneKey, locked: lock?.locked ?? false, occupants: this.occupants(zoneKey) };
  }

  private zoneStates(): ZoneState[] {
    return [...this.locks.keys()].map((zoneKey) => this.zoneState(zoneKey));
  }

  /** Entrada e saída de zona: estado da sala, destranca automática, atividade e sala de mídia. */
  private afterMove(userId: string): void {
    const member = this.members.get(userId);
    const player = this.world.players.get(userId);
    if (!member || !player) return;
    const zoneKey = zoneAt(this.map, player.x, player.y).key;
    this.checkReception(userId);
    if (zoneKey === member.zoneKey) return;
    const previousZoneKey = member.zoneKey;
    member.zoneKey = zoneKey;
    this.zoneChanged(previousZoneKey);
    this.zoneChanged(zoneKey);
    this.refresh(userId);
  }

  /**
   * Alguém entrou ou saiu da sala: sala trancada que esvaziou destranca sozinha (e as batidas
   * pendentes são recusadas), e todos recebem o estado novo.
   */
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

  /** Tranca ou destranca a sala; só quem está dentro. Trancar libera quem já estava lá. */
  private setZoneLock(userId: string, connection: Conn, zoneKey: string, locked: boolean): void {
    const lock = this.locks.get(zoneKey);
    if (!lock || this.members.get(userId)?.zoneKey !== zoneKey) {
      this.send(connection, { t: 'error', code: 'not_in_zone' });
      return;
    }
    lock.locked = locked;
    lock.allowed = locked ? new Set(this.occupants(zoneKey)) : new Set();
    this.recordLock(zoneKey);
    this.broadcast({ t: 'zone.state', zone: this.zoneState(zoneKey) });
  }

  /**
   * Bate na porta: só de fora, num tile vizinho à sala trancada. O pedido vai para todos os
   * ocupantes e expira sozinho em KNOCK_TIMEOUT_MS.
   */
  private knockOnZone(userId: string, connection: Conn, zoneKey: string): void {
    const lock = this.locks.get(zoneKey);
    const player = this.world.players.get(userId);
    if (!lock || !player) {
      this.send(connection, { t: 'error', code: 'not_at_door' });
      return;
    }
    if (!lock.locked) {
      this.send(connection, { t: 'error', code: 'not_locked' });
      return;
    }
    const inside = zoneAt(this.map, player.x, player.y).key === zoneKey;
    const atDoor = Object.values(DIR_DELTA).some(
      ([dx, dy]) => zoneAt(this.map, player.x + dx, player.y + dy).key === zoneKey,
    );
    if (inside || !atDoor) {
      this.send(connection, { t: 'error', code: 'not_at_door' });
      return;
    }
    // Batida repetida enquanto a anterior espera resposta é ignorada.
    if ([...this.knocks.values()].some((pendingKnock) => pendingKnock.from === userId && pendingKnock.zoneKey === zoneKey)) return;

    const requestId = randomUUID();
    const timer = this.deps.scheduler.setTimeout(() => this.resolveKnock(requestId, false), KNOCK_TIMEOUT_MS);
    this.knocks.set(requestId, { zoneKey, from: userId, timer });
    const serializedRequest = JSON.stringify({ t: 'zone.knockRequest', requestId, zoneKey, from: userId } satisfies ServerMsg);
    for (const id of this.occupants(zoneKey)) this.members.get(id)?.connection?.send(serializedRequest);
  }

  /** A primeira resposta de um ocupante vale; as seguintes encontram o pedido já resolvido. */
  private knockReply(userId: string, requestId: string, allow: boolean): void {
    const knock = this.knocks.get(requestId);
    if (!knock || this.members.get(userId)?.zoneKey !== knock.zoneKey) return;
    this.resolveKnock(requestId, allow);
  }

  /** Fecha o pedido e avisa quem bateu; só libera se a sala continua trancada. */
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
    const knockerConnection = this.members.get(knock.from)?.connection;
    if (knockerConnection) this.send(knockerConnection, { t: 'zone.knockResult', zoneKey: knock.zoneKey, allowed });
  }

  // ---- chamadas ----

  private callOf(userId: string): Call | undefined {
    for (const call of this.calls.values()) if (call.from === userId || call.to === userId) return call;
    return undefined;
  }

  /** Sentado = no tile da cadeira da própria mesa. */
  private isSeated(userId: string): boolean {
    const player = this.world.players.get(userId);
    if (!player) return false;
    return this.map.desks.some(
      (desk) => desk.chairX === player.x && desk.chairY === player.y && this.desks.get(desk.key)?.userId === userId,
    );
  }

  /**
   * Liga para outro membro. Quem liga precisa estar sentado na própria mesa; o destino precisa
   * estar conectado e livre (sem chamada, reunião ou jogo), senão volta `busy`.
   */
  private inviteToCall(userId: string, connection: Conn, targetUserId: string): void {
    if (!this.isSeated(userId)) {
      this.send(connection, { t: 'error', code: 'not_seated' });
      return;
    }
    if (targetUserId === userId || !this.members.get(targetUserId)?.connection) {
      this.send(connection, { t: 'error', code: 'call_unavailable' });
      return;
    }
    if (this.callOf(userId)) {
      this.send(connection, { t: 'error', code: 'already_in_call' });
      return;
    }
    const id = randomUUID();
    if (this.callOf(targetUserId) || this.activityOf(targetUserId) === 'meeting' || this.games.seatOf(targetUserId)) {
      this.send(connection, { t: 'call.ended', callId: id, reason: 'busy' });
      return;
    }
    const call: Call = { id, from: userId, to: targetUserId, active: false, timer: null };
    call.timer = this.deps.scheduler.setTimeout(() => this.endCall(call, 'timeout'), CALL_RING_TIMEOUT_MS);
    this.calls.set(id, call);
    const targetConnection = this.members.get(targetUserId)?.connection;
    if (targetConnection) this.send(targetConnection, { t: 'call.incoming', callId: id, from: userId });
  }

  /** Resposta de quem recebeu a ligação; atender move os dois para a sala da chamada. */
  private answerCall(userId: string, callId: string, accept: boolean): void {
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
    const endedMessage: ServerMsg = { t: 'call.ended', callId: call.id, reason };
    for (const id of [call.from, call.to]) {
      const participantConnection = this.members.get(id)?.connection;
      if (participantConnection) this.send(participantConnection, endedMessage);
      this.refresh(id);
    }
  }

  // ---- atividade e mídia ----

  /** Atividade mostrada aos outros, em ordem de prioridade: chamada, jogo, reunião. */
  private activityOf(userId: string): Activity {
    if (this.callOf(userId)?.active) return 'call';
    if (this.games.seatOf(userId)) return 'game';
    const player = this.world.players.get(userId);
    if (player && zoneAt(this.map, player.x, player.y).type === 'meeting') return 'meeting';
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

  /** Sala de mídia em que o jogador deve estar: a da chamada, a da reunião ou a aberta do coworking. */
  private mediaRoomOf(userId: string): string {
    const call = this.callOf(userId);
    if (call?.active) return callRoom(call.id);
    const player = this.world.players.get(userId);
    const zone = player ? zoneAt(this.map, player.x, player.y) : undefined;
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
    const previousRoom = member.mediaRoom;
    member.mediaRoom = room;
    this.checkReception(userId);
    if (previousRoom) this.removeFromRoom(previousRoom, userId);
    const connection = member.connection;
    if (connection) void this.sendMediaJoin(userId, connection, room);
  }

  private removeFromRoom(room: string, userId: string): void {
    this.deps.media.removeParticipant(room, userId).catch((error: unknown) => {
      // Quem já saiu da sala por conta própria dá "não encontrado" no LiveKit; não muda nada.
      if (!isNotFound(error)) this.deps.log.error({ error, userId, room }, 'falha ao remover da sala de mídia');
    });
  }

  /** Assina o token da sala (tela só fora da sala aberta) e manda o `media.join`. */
  private async sendMediaJoin(userId: string, connection: Conn, room: string): Promise<void> {
    const sources = room === spaceRoom(this.spaceId) ? SPACE_SOURCES : PRIVATE_SOURCES;
    try {
      const token = await this.deps.media.token(userId, room, sources);
      if (this.deps.metrics) this.deps.metrics.mediaTokens++;
      // A sala pode ter mudado de novo, ou a conexão caído, enquanto o token era assinado.
      const member = this.members.get(userId);
      if (member?.connection !== connection || member.mediaRoom !== room) return;
      this.send(connection, { t: 'media.join', room, token, url: this.deps.media.url });
    } catch (error) {
      this.deps.log.error({ error, userId, room }, 'falha ao emitir token de mídia');
    }
  }

  setReceptionEnabled(enabled: boolean): void { this.reception?.setEnabled(enabled); }

  private receptionVisitor(userId: string, connection: Conn): ReceptionVisitor | null {
    const player = this.world.players.get(userId);
    const member = this.members.get(userId);
    if (!player || member?.connection !== connection || member.mediaRoom === null) return null;
    return {
      id: userId, x: player.x, y: player.y, room: this.mediaRoomOf(userId),
      current: () => this.members.get(userId)?.connection === connection,
      send: (message) => this.send(connection, message),
    };
  }

  private checkReception(userId: string): void {
    if (!this.reception) return;
    const connection = this.members.get(userId)?.connection;
    const visitor = connection && this.receptionVisitor(userId, connection);
    if (visitor) this.reception.check(visitor);
  }

  // ---- chat ----

  /** Destinatários calculados aqui: o cliente não escolhe quem lê. Nada é guardado. */
  private sendChat(userId: string, member: Member, connection: Conn, rawText: string): void {
    const text = rawText.trim();
    // Conta caracteres, não unidades UTF-16: emoji vale um.
    const length = Array.from(text).length;
    if (length === 0 || length > CHAT_MAX_CHARS) {
      this.send(connection, { t: 'error', code: 'chat_invalid' });
      return;
    }
    if (!member.chatBucket.take()) {
      this.send(connection, { t: 'error', code: 'chat_rate' });
      return;
    }
    const author = this.world.players.get(userId);
    if (!author) return;
    const players = [...this.world.players].map(([id, player]) => ({ id, x: player.x, y: player.y }));
    const serializedChat = JSON.stringify({ t: 'chat.said', from: userId, text } satisfies ServerMsg);
    for (const id of chatRecipients(this.map, { id: userId, x: author.x, y: author.y }, players)) {
      this.members.get(id)?.connection?.send(serializedChat);
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
    this.reception?.stopFor(userId, 'left');
    // Desliga a conexão do membro antes de fechar, para o onClose dela não abrir uma tolerância.
    const connection = member.connection;
    member.connection = null;
    connection?.close(CLOSE_REMOVED, 'removed');
    this.leave(userId);
  }

  /** Tira a pessoa do mapa de vez: encerra chamada, batidas e jogo, sai da sala de mídia e avisa todos. */
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
    this.seatedOnFurniture.delete(userId);
    if (member.mediaRoom) this.removeFromRoom(member.mediaRoom, userId);
    this.members.delete(userId);
    const players = new Map(this.world.players);
    players.delete(userId);
    this.world = { players };
    this.record({ t: this.deps.clock.now(), type: 'leave', id: userId });
    this.movedSinceTick.delete(userId);
    this.broadcast({ t: 'player.leave', id: userId });
    this.zoneChanged(member.zoneKey);
    if (this.members.size === 0) {
      this.ticker?.cancel();
      this.ticker = null;
    }
  }

  /** Jogador no formato do protocolo: perfil, id curto, posição e atividade. */
  private player(id: string): Player {
    const member = this.members.get(id);
    const simPlayer = this.world.players.get(id);
    if (!member || !simPlayer) throw new Error(`jogador ${id} sem estado`);
    return {
      ...member.profile, shortId: member.shortId, x: simPlayer.x, y: simPlayer.y, dir: simPlayer.dir,
      activity: member.activity, seatedAt: this.seatedOnFurniture.get(id) ?? null,
    };
  }

  private send(connection: Conn, message: ServerMsg): void {
    connection.send(JSON.stringify(message));
  }

  /** Serializa uma vez e manda para todos os conectados, menos `exceptId`. */
  private broadcast(message: ServerMsg, exceptId?: string): void {
    const serializedMessage = JSON.stringify(message);
    for (const [id, member] of this.members) {
      if (id !== exceptId) member.connection?.send(serializedMessage);
    }
  }
}

/** Erro do LiveKit (ServerError do SDK) para participante ou sala inexistente. */
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, status } = error as { code?: unknown; status?: unknown };
  return code === 'not_found' || status === 404;
}

/** Mensagem do cliente validada pelo schema do protocolo; JSON quebrado ou fora do schema dá null. */
function parseClientMsg(rawMessage: string): ClientMsg | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawMessage);
  } catch {
    return null;
  }
  const parsed = ClientMsg.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}
