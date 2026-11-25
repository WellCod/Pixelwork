import {
  zoneAt,
  type ClientMsg,
  type CompiledMap,
  type DeskState,
  type Dir,
  type GameSeat,
  type Player,
  type ReceptionDestination,
  type ReceptionPresence,
  type PongDir,
  type PongEvent,
  type ServerMsg,
  type TableState,
  type ZoneState,
} from '@pixelwork/shared';
import type { PendingGameInput } from './pong-predict.ts';
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
  | { type: 'reception' }
  | { type: 'receptionDestination' }
  | { type: 'mapUpdated'; version: number }
  | { type: 'knockRequest'; requestId: string; zoneKey: string; from: string }
  | { type: 'knockResult'; zoneKey: string; allowed: boolean }
  | { type: 'callIncoming'; callId: string; from: string }
  | { type: 'callEnded'; callId: string; reason: 'declined' | 'left' | 'timeout' | 'busy' }
  | { type: 'remoteMove'; id: string; x: number; y: number; dir: Dir }
  /** A predição divergiu do servidor: o avatar próprio vai direto para `pos`. */
  | { type: 'selfCorrected'; pos: Pos }
  | { type: 'selfStep'; pos: Pos }
  | { type: 'table'; table: TableState }
  /** Chegou um estado novo da própria partida (`lastGame`). */
  | { type: 'game' }
  | { type: 'gameEvents'; events: PongEvent[] };

/** Estado do coworking no cliente: jogadores conhecidos e predição do próprio avatar. */
export class ClientWorld {
  selfId: string | null = null;
  readonly players = new Map<string, Player>();
  /** Id curto do tick binário -> id. */
  private readonly shortIds = new Map<number, string>();
  readonly desks = new Map<string, DeskState>();
  readonly zones = new Map<string, ZoneState>();
  reception: ReceptionPresence | null = null;
  receptionDestination: ReceptionDestination | null = null;
  receptionSession: Extract<ServerMsg, { t: 'reception.session' }> | null = null;
  readonly tables = new Map<string, TableState>();
  /** Mesa em que o próprio jogador está; a janela do jogo fica aberta enquanto existir. */
  seat: GameSeat | null = null;
  /** Último estado da própria partida e a hora local em que chegou. */
  lastGame: (Extract<ServerMsg, { t: 'game.state' }> & { receivedAt: number }) | null = null;
  /** Inputs da raquete ainda sem ack, e a direção que o servidor já aplica. */
  gamePending: PendingGameInput[] = [];
  gameAckedDir: PongDir = 0;
  private gameSeq = 0;
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
    this.clearReceptionDestination();
  }

  clearReceptionDestination(): void {
    if (!this.receptionDestination) return;
    this.receptionDestination = null;
    this.emit({ type: 'receptionDestination' });
  }

  private checkReceptionPerson(id: string): void {
    if (this.receptionDestination?.kind !== 'person' || this.receptionDestination.id !== id) return;
    const player = this.players.get(id);
    if (!player || player.activity === 'call' || player.activity === 'meeting' || zoneAt(this.map, player.x, player.y).type === 'meeting') {
      this.clearReceptionDestination();
    }
  }

  subscribe(listener: (event: WorldEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Aplica uma mensagem do servidor ao estado local e avisa os assinantes. */
  handle(message: ServerMsg): void {
    switch (message.t) {
      case 'welcome': {
        this.reception = message.reception ?? null;
        this.receptionSession = null;
        this.receptionDestination = null;
        this.selfId = message.selfId;
        this.players.clear();
        this.shortIds.clear();
        for (const player of message.players) {
          this.players.set(player.id, player);
          this.shortIds.set(player.shortId, player.id);
        }
        this.desks.clear();
        for (const desk of message.desks) this.desks.set(desk.deskKey, desk);
        this.zones.clear();
        for (const zone of message.zones) this.zones.set(zone.zoneKey, zone);
        this.tables.clear();
        for (const table of message.tables) this.tables.set(table.tableKey, table);
        this.seat = message.game;
        this.lastGame = null;
        // Como o seq do movimento, o do jogo recomeça a cada welcome (o servidor zera o ack).
        this.gameSeq = 0;
        this.gamePending = [];
        this.gameAckedDir = 0;
        const selfPlayer = this.players.get(message.selfId);
        this.self = selfPlayer ? { x: selfPlayer.x, y: selfPlayer.y, dir: selfPlayer.dir } : this.self;
        this.authoritative = this.self;
        this.pending = [];
        this.seq = 0;
        this.allowedZones.clear();
        this.emit({ type: 'reset' });
        break;
      }
      case 'tick': {
        if (message.ts !== undefined) this.lastTick = { serverTs: message.ts, receivedAt: Date.now() };
        // Movimento do próprio jogador só atualiza a posição autoritativa: a tela segue a predição,
        // e a reconciliação abaixo decide se ela precisa ser corrigida.
        for (const [id, x, y, dir] of message.moves) {
          const player = this.players.get(id);
          if (player) Object.assign(player, { x, y, dir });
          this.checkReceptionPerson(id);
          if (id === this.selfId) this.authoritative = { x, y, dir };
          else this.emit({ type: 'remoteMove', id, x, y, dir });
        }
        const result = reconcile(this.authoritative, message.ack, this.pending, this.map, this.canEnter);
        this.pending = result.pending;
        if (result.pos.x !== this.self.x || result.pos.y !== this.self.y) {
          this.corrections++;
          this.self = result.pos;
          this.emit({ type: 'selfCorrected', pos: this.self });
        }
        break;
      }
      case 'player.join':
        this.players.set(message.player.id, message.player);
        this.shortIds.set(message.player.shortId, message.player.id);
        this.emit({ type: 'join', player: message.player });
        break;
      case 'player.leave': {
        // O id curto pode já ter sido reaproveitado por quem entrou depois: só apaga se ainda for dele.
        const shortId = this.players.get(message.id)?.shortId;
        if (shortId !== undefined && this.shortIds.get(shortId) === message.id) this.shortIds.delete(shortId);
        this.players.delete(message.id);
        this.checkReceptionPerson(message.id);
        this.emit({ type: 'leave', id: message.id });
        break;
      }
      case 'player.update': {
        const player = this.players.get(message.id);
        if (player) Object.assign(player, message.patch);
        this.checkReceptionPerson(message.id);
        this.emit({ type: 'update', id: message.id });
        break;
      }
      case 'desk.updated':
        this.desks.set(message.desk.deskKey, message.desk);
        this.emit({ type: 'desk', desk: message.desk });
        break;
      case 'chat.said':
        this.emit({ type: 'chat', from: message.from, text: message.text });
        break;
      case 'error':
        this.emit({ type: 'error', code: message.code });
        break;
      case 'map.updated':
        this.clearReceptionDestination();
        this.emit({ type: 'mapUpdated', version: message.version });
        break;
      case 'reception.state':
        this.reception = message.reception;
        this.emit({ type: 'reception' });
        break;
      case 'reception.destination':
        this.receptionDestination = message.destination;
        if (message.destination?.kind === 'person') this.checkReceptionPerson(message.destination.id);
        this.emit({ type: 'receptionDestination' });
        break;
      case 'reception.session':
        this.receptionSession = message;
        this.emit({ type: 'reception' });
        break;
      case 'zone.state':
        this.zones.set(message.zone.zoneKey, message.zone);
        if (!message.zone.locked) this.allowedZones.delete(message.zone.zoneKey);
        this.emit({ type: 'zone', zone: message.zone });
        break;
      case 'zone.knockRequest':
        this.emit({ type: 'knockRequest', requestId: message.requestId, zoneKey: message.zoneKey, from: message.from });
        break;
      case 'zone.knockResult':
        if (message.allowed) this.allowedZones.add(message.zoneKey);
        this.emit({ type: 'knockResult', zoneKey: message.zoneKey, allowed: message.allowed });
        break;
      case 'call.incoming':
        this.emit({ type: 'callIncoming', callId: message.callId, from: message.from });
        break;
      case 'call.ended':
        this.emit({ type: 'callEnded', callId: message.callId, reason: message.reason });
        break;
      case 'table.state': {
        const table = message.table;
        this.tables.set(table.tableKey, table);
        if (this.seat?.tableKey === table.tableKey && table.phase === 'waiting') this.lastGame = null;
        const side = table.left === this.selfId ? 'left' : table.right === this.selfId ? 'right' : null;
        if (side) {
          if (this.seat?.tableKey !== table.tableKey) this.resetGameInput();
          this.seat = { tableKey: table.tableKey, side };
        } else if (this.seat?.tableKey === table.tableKey) {
          this.seat = null;
          this.lastGame = null;
        }
        this.emit({ type: 'table', table });
        break;
      }
      case 'game.state': {
        if (this.seat?.tableKey !== message.tableKey) break;
        // O último input confirmado vira a direção que o servidor já aplica; os seguintes ficam
        // pendentes para a previsão da raquete.
        const acked = this.gamePending.filter((input) => input.seq <= message.ack).at(-1);
        if (acked) this.gameAckedDir = acked.dir;
        this.gamePending = this.gamePending.filter((input) => input.seq > message.ack);
        this.lastGame = { ...message, receivedAt: Date.now() };
        this.emit({ type: 'game' });
        break;
      }
      case 'game.events':
        if (this.seat?.tableKey === message.tableKey) this.emit({ type: 'gameEvents', events: message.events });
        break;
      default:
        break;
    }
  }

  /** Intenção nova da raquete: guarda para a previsão e devolve a mensagem a enviar. */
  gameInput(dir: PongDir): ClientMsg {
    this.gameSeq++;
    this.gamePending.push({ seq: this.gameSeq, dir, at: Date.now() });
    return { t: 'game.input', seq: this.gameSeq, dir };
  }

  /** O servidor zera o ack de quem entra numa mesa: a contagem recomeça. */
  private resetGameInput(): void {
    this.gameSeq = 0;
    this.gamePending = [];
    this.gameAckedDir = 0;
    this.lastGame = null;
  }

  /** Aplica a predição e devolve a mensagem a enviar. */
  move(dir: Dir): ClientMsg {
    this.seq++;
    this.pending.push({ seq: this.seq, dir });
    this.self = predictStep(this.self, dir, this.map, this.canEnter);
    this.emit({ type: 'selfStep', pos: this.self });
    return { t: 'move', seq: this.seq, dir };
  }

  /** Id completo a partir do id curto do tick binário. */
  idOf(shortId: number): string | undefined {
    return this.shortIds.get(shortId);
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
  readonly canEnter: CanEnter = (from, x, y) => {
    const zone = zoneAt(this.map, x, y);
    if (zone.type !== 'meeting' || !this.zones.get(zone.key)?.locked) return true;
    return zoneAt(this.map, from.x, from.y).key === zone.key || this.allowedZones.has(zone.key);
  };

  private emit(event: WorldEvent): void {
    // O estado da partida chega a 30 Hz e é lido direto pelo desenho do jogo: não re-renderiza a UI.
    if (event.type !== 'game') this.version++;
    for (const listener of this.listeners) listener(event);
  }
}
