// Mesas de jogo de um coworking (docs/architecture.md, "Interações com objetos"): quem está em
// cada lado, a partida em andamento e o laço de 30 Hz que só existe enquanto há partida.
import {
  PONG,
  botInput,
  newPong,
  pausePong,
  resumePong,
  stepPong,
  type CompiledTable,
  type GameSeat,
  type PongDir,
  type PongSide,
  type PongState,
  type ServerMsg,
  type TableState,
} from '@pixelwork/shared';
import type { Clock, Scheduler, Timer } from './clock.ts';

/** O que as mesas precisam do runtime do coworking: tempo, envio de mensagens e aviso de atividade. */
export interface GameHost {
  clock: Clock;
  scheduler: Scheduler;
  send(userId: string, message: ServerMsg): void;
  broadcast(message: ServerMsg): void;
  /** A atividade do jogador mudou (entrou ou saiu de uma mesa). */
  activityChanged(userId: string): void;
  /** Duração de cada quadro da partida, em segundos (métrica). */
  observeFrame?(seconds: number): void;
}

export interface GameOptions {
  /** Estado inicial de cada partida; os testes começam perto do fim. */
  start?: (now: number) => PongState;
}

export type JoinError = 'table_not_found' | 'table_not_at_side' | 'table_side_taken' | 'table_busy';

/** Ocupante do lado da mesa quando a pessoa joga contra o computador. */
const BOT = 'bot';

/** Partida em andamento: estado da simulação, última direção de cada lado e pedidos de revanche. */
interface Match {
  state: PongState;
  inputs: { left: PongDir; right: PongDir };
  /** Laço de quadros; null quando a partida está pausada ou terminou. */
  timer: Timer | null;
  rematch: Set<PongSide>;
}

/** Mesa do mapa: quem ocupa cada lado (id do usuário, BOT ou ninguém) e a partida, se houver. */
interface Table {
  definition: CompiledTable;
  left: string | null;
  right: string | null;
  match: Match | null;
  /** Último `seq` de input aceito de cada jogador, devolvido no `ack`. */
  acks: Map<string, number>;
}

const oppositeSide = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');
const isHuman = (occupant: string | null): occupant is string => occupant !== null && occupant !== BOT;

/**
 * Estado de todas as mesas de jogo de um coworking. O servidor é a autoridade da partida: o
 * cliente só manda direção e recebe o estado de cada quadro.
 */
export class GameRegistry {
  private readonly tables = new Map<string, Table>();
  private readonly seats = new Map<string, GameSeat>();
  /** Jogadores sem conexão (dentro da tolerância de reconexão). */
  private readonly offline = new Set<string>();
  private readonly createMatchState: (now: number) => PongState;

  constructor(
    definitions: CompiledTable[],
    private readonly host: GameHost,
    options: GameOptions = {},
  ) {
    this.createMatchState = options.start ?? newPong;
    for (const definition of definitions) this.tables.set(definition.key, { definition, left: null, right: null, match: null, acks: new Map() });
  }

  /**
   * Senta o jogador no lado da mesa onde ele está parado. Trocar de mesa ou de lado sai da
   * anterior; com gente dos dois lados a partida começa na hora.
   */
  join(userId: string, tableKey: string, position: { x: number; y: number }, inCall: boolean): JoinError | null {
    const table = this.tables.get(tableKey);
    if (!table) return 'table_not_found';
    if (inCall) return 'table_busy';
    const side = (['left', 'right'] as const).find((candidateSide) =>
      table.definition.sides[candidateSide].some(([x, y]) => x === position.x && y === position.y),
    );
    if (!side) return 'table_not_at_side';
    const seat = this.seats.get(userId);
    // Já sentado ali: nada muda.
    if (seat?.tableKey === tableKey && seat.side === side) return null;
    if (isHuman(table[side]) && table[side] !== userId) return 'table_side_taken';
    if (seat) this.leave(userId);

    // O bot só joga contra uma pessoa: quem chega no lado dele o substitui.
    this.stopMatch(table);
    if (table[oppositeSide(side)] === BOT) table[oppositeSide(side)] = null;
    table[side] = userId;
    table.acks.set(userId, 0);
    this.seats.set(userId, { tableKey, side });
    if (isHuman(table[oppositeSide(side)])) this.startMatch(table);
    this.broadcastTable(table);
    this.host.activityChanged(userId);
    return null;
  }

  /** Começa contra o bot, se ninguém está do outro lado. */
  bot(userId: string): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    if (!seat || !table || table[oppositeSide(seat.side)] !== null) return;
    table[oppositeSide(seat.side)] = BOT;
    this.startMatch(table);
    this.broadcastTable(table);
  }

  /** Direção da raquete; `seq` repetido ou fora de ordem é descartado. */
  input(userId: string, seq: number, dir: PongDir): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    if (!seat || !table?.match || seq <= (table.acks.get(userId) ?? 0)) return;
    table.acks.set(userId, seq);
    table.match.inputs[seat.side] = dir;
  }

  /** Revanche: contra o bot recomeça na hora; 1x1, quando os dois pedirem. */
  rematch(userId: string): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    if (!seat || !table?.match || table.match.state.phase !== 'ended') return;
    table.match.rematch.add(seat.side);
    const opponent = table[oppositeSide(seat.side)];
    if (opponent === BOT || table.match.rematch.has(oppositeSide(seat.side))) {
      this.startMatch(table);
      this.broadcastTable(table);
    }
  }

  /** Sai da mesa. Em 1x1 com partida em andamento, o outro vence por desistência. */
  leave(userId: string): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    this.seats.delete(userId);
    this.offline.delete(userId);
    if (!seat || !table) return;
    const opponent = table[oppositeSide(seat.side)];
    if (isHuman(opponent) && table.match && table.match.state.phase !== 'ended') {
      this.host.send(opponent, { t: 'game.events', tableKey: table.definition.key, events: [{ type: 'end', winner: oppositeSide(seat.side) }] });
    }
    this.stopMatch(table);
    table[seat.side] = null;
    table.acks.delete(userId);
    if (opponent === BOT) table[oppositeSide(seat.side)] = null;
    this.broadcastTable(table);
    this.host.activityChanged(userId);
  }

  /** Queda de conexão: a partida pausa até a pessoa voltar ou a tolerância acabar. */
  disconnected(userId: string): void {
    this.offline.add(userId);
    const table = this.tableOf(userId);
    const match = table?.match;
    // A tecla solta durante a queda nunca chega: a raquete para em vez de correr até a parede.
    const seat = this.seats.get(userId);
    if (match && seat) match.inputs[seat.side] = 0;
    if (!table || !match || match.state.phase === 'ended' || match.state.phase === 'paused') return;
    match.timer?.cancel();
    match.timer = null;
    match.state = pausePong(match.state);
    this.sendState(table, match.state);
  }

  /** Volta da queda: a partida retoma com contagem quando todos os jogadores estão conectados. */
  reconnected(userId: string): void {
    this.offline.delete(userId);
    const table = this.tableOf(userId);
    // O cliente recomeça a contagem de seq a cada welcome, como no movimento.
    if (table) table.acks.set(userId, 0);
    const match = table?.match;
    if (!table || !match || match.state.phase !== 'paused') return;
    if ([table.left, table.right].some((id) => isHuman(id) && this.offline.has(id))) return;
    match.state = resumePong(match.state, this.host.clock.now());
    match.timer = this.host.scheduler.setInterval(() => this.runFrame(table, match), PONG.FRAME_MS);
  }

  /** Troca de mapa: encerra as partidas, libera as mesas antigas e passa a usar as novas. */
  replaceTables(definitions: CompiledTable[]): void {
    const seatedUserIds = [...this.seats.keys()];
    for (const table of this.tables.values()) {
      this.stopMatch(table);
      table.left = null;
      table.right = null;
      this.broadcastTable(table);
    }
    this.seats.clear();
    this.tables.clear();
    for (const definition of definitions) {
      const table: Table = { definition, left: null, right: null, match: null, acks: new Map() };
      this.tables.set(definition.key, table);
      this.broadcastTable(table);
    }
    for (const userId of seatedUserIds) this.host.activityChanged(userId);
  }

  /** Runtime descarregado: nenhum intervalo de partida sobrevive. */
  close(): void {
    for (const table of this.tables.values()) this.stopMatch(table);
  }

  seatOf(userId: string): GameSeat | null {
    return this.seats.get(userId) ?? null;
  }

  states(): TableState[] {
    return [...this.tables.values()].map((table) => this.stateOf(table));
  }

  activeMatches(): number {
    return [...this.tables.values()].filter((table) => table.match?.timer).length;
  }

  private tableOf(userId: string): Table | undefined {
    const seat = this.seats.get(userId);
    return seat && this.tables.get(seat.tableKey);
  }

  /** Resumo público da mesa: livre, esperando adversário, jogando ou terminada. */
  private stateOf(table: Table): TableState {
    const { match } = table;
    const phase = match ? (match.state.phase === 'ended' ? 'ended' : 'playing') : table.left || table.right ? 'waiting' : 'free';
    return {
      tableKey: table.definition.key,
      phase,
      left: table.left,
      right: table.right,
      score: match ? { ...match.state.score } : { left: 0, right: 0 },
    };
  }

  private startMatch(table: Table): void {
    this.stopMatch(table);
    const { clock, scheduler } = this.host;
    const match: Match = { state: this.createMatchState(clock.now()), inputs: { left: 0, right: 0 }, timer: null, rematch: new Set() };
    table.match = match;
    match.timer = scheduler.setInterval(() => this.runFrame(table, match), PONG.FRAME_MS);
  }

  private stopMatch(table: Table): void {
    table.match?.timer?.cancel();
    table.match = null;
  }

  /** Um quadro da partida: aplica as direções (a do bot calculada aqui), avança e envia o estado. */
  private runFrame(table: Table, match: Match): void {
    const frameStartedAt = performance.now();
    const previousState = match.state;
    const inputs = {
      left: table.left === BOT ? botInput(previousState, 'left') : match.inputs.left,
      right: table.right === BOT ? botInput(previousState, 'right') : match.inputs.right,
    };
    const { state, events } = stepPong(previousState, inputs, this.host.clock.now());
    match.state = state;
    this.sendState(table, state);
    if (state.phase === 'ended') {
      match.timer?.cancel();
      match.timer = null;
    }
    // A mesa muda antes dos eventos: quem recebe o `end` já vê a mesa em `ended` (e não confunde
    // fim normal com desistência).
    const scored = previousState.score.left !== state.score.left || previousState.score.right !== state.score.right;
    if (scored || previousState.phase !== state.phase) this.broadcastTable(table);
    if (events.length > 0) {
      for (const playerId of [table.left, table.right].filter(isHuman)) {
        this.host.send(playerId, { t: 'game.events', tableKey: table.definition.key, events });
      }
    }
    this.host.observeFrame?.((performance.now() - frameStartedAt) / 1000);
  }

  private sendState(table: Table, state: PongState): void {
    for (const playerId of [table.left, table.right].filter(isHuman)) {
      this.host.send(playerId, {
        t: 'game.state',
        tableKey: table.definition.key,
        ack: table.acks.get(playerId) ?? 0,
        phase: state.phase,
        serveAt: state.serveAt,
        ball: state.ball,
        paddles: state.paddles,
        score: state.score,
        serverTs: state.at,
      });
    }
  }

  private broadcastTable(table: Table): void {
    this.host.broadcast({ t: 'table.state', table: this.stateOf(table) });
  }
}
