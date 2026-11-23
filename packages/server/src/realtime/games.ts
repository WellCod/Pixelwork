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

export interface GameHost {
  clock: Clock;
  scheduler: Scheduler;
  send(userId: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
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

const BOT = 'bot';

interface Match {
  state: PongState;
  inputs: { left: PongDir; right: PongDir };
  timer: Timer | null;
  rematch: Set<PongSide>;
}

interface Table {
  def: CompiledTable;
  left: string | null;
  right: string | null;
  match: Match | null;
  /** Último `seq` de input aceito de cada jogador, devolvido no `ack`. */
  acks: Map<string, number>;
}

const other = (side: PongSide): PongSide => (side === 'left' ? 'right' : 'left');
const isHuman = (id: string | null): id is string => id !== null && id !== BOT;

export class GameRegistry {
  private readonly tables = new Map<string, Table>();
  private readonly seats = new Map<string, GameSeat>();
  /** Jogadores sem conexão (dentro da tolerância de reconexão). */
  private readonly offline = new Set<string>();
  private readonly start: (now: number) => PongState;

  constructor(
    defs: CompiledTable[],
    private readonly host: GameHost,
    options: GameOptions = {},
  ) {
    this.start = options.start ?? newPong;
    for (const def of defs) this.tables.set(def.key, { def, left: null, right: null, match: null, acks: new Map() });
  }

  join(userId: string, tableKey: string, pos: { x: number; y: number }, inCall: boolean): JoinError | null {
    const table = this.tables.get(tableKey);
    if (!table) return 'table_not_found';
    if (inCall) return 'table_busy';
    const side = (['left', 'right'] as const).find((s) => table.def.sides[s].some(([x, y]) => x === pos.x && y === pos.y));
    if (!side) return 'table_not_at_side';
    const seat = this.seats.get(userId);
    if (seat?.tableKey === tableKey && seat.side === side) return null;
    if (isHuman(table[side]) && table[side] !== userId) return 'table_side_taken';
    if (seat) this.leave(userId);

    // O bot só joga contra uma pessoa: quem chega no lado dele o substitui.
    this.stop(table);
    if (table[other(side)] === BOT) table[other(side)] = null;
    table[side] = userId;
    table.acks.set(userId, 0);
    this.seats.set(userId, { tableKey, side });
    if (isHuman(table[other(side)])) this.begin(table);
    this.changed(table);
    this.host.activityChanged(userId);
    return null;
  }

  /** Começa contra o bot, se ninguém está do outro lado. */
  bot(userId: string): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    if (!seat || !table || table[other(seat.side)] !== null) return;
    table[other(seat.side)] = BOT;
    this.begin(table);
    this.changed(table);
  }

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
    const opponent = table[other(seat.side)];
    if (opponent === BOT || table.match.rematch.has(other(seat.side))) {
      this.begin(table);
      this.changed(table);
    }
  }

  /** Sai da mesa. Em 1x1 com partida em andamento, o outro vence por desistência. */
  leave(userId: string): void {
    const seat = this.seats.get(userId);
    const table = seat && this.tables.get(seat.tableKey);
    this.seats.delete(userId);
    this.offline.delete(userId);
    if (!seat || !table) return;
    const opponent = table[other(seat.side)];
    if (isHuman(opponent) && table.match && table.match.state.phase !== 'ended') {
      this.host.send(opponent, { t: 'game.events', tableKey: table.def.key, events: [{ type: 'end', winner: other(seat.side) }] });
    }
    this.stop(table);
    table[seat.side] = null;
    table.acks.delete(userId);
    if (opponent === BOT) table[other(seat.side)] = null;
    this.changed(table);
    this.host.activityChanged(userId);
  }

  /** Queda de conexão: a partida pausa até a pessoa voltar ou a tolerância acabar. */
  disconnected(userId: string): void {
    this.offline.add(userId);
    const table = this.tableOf(userId);
    const match = table?.match;
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
    const match = table?.match;
    if (!table || !match || match.state.phase !== 'paused') return;
    if ([table.left, table.right].some((id) => isHuman(id) && this.offline.has(id))) return;
    match.state = resumePong(match.state, this.host.clock.now());
    match.timer = this.host.scheduler.setInterval(() => this.frame(table, match), PONG.FRAME_MS);
  }

  /** Troca de mapa: encerra as partidas, libera as mesas antigas e passa a usar as novas. */
  replaceTables(defs: CompiledTable[]): void {
    const seated = [...this.seats.keys()];
    for (const table of this.tables.values()) {
      this.stop(table);
      table.left = null;
      table.right = null;
      this.changed(table);
    }
    this.seats.clear();
    this.tables.clear();
    for (const def of defs) {
      const table: Table = { def, left: null, right: null, match: null, acks: new Map() };
      this.tables.set(def.key, table);
      this.changed(table);
    }
    for (const id of seated) this.host.activityChanged(id);
  }

  seatOf(userId: string): GameSeat | null {
    return this.seats.get(userId) ?? null;
  }

  states(): TableState[] {
    return [...this.tables.values()].map((t) => this.stateOf(t));
  }

  activeMatches(): number {
    return [...this.tables.values()].filter((t) => t.match?.timer).length;
  }

  private tableOf(userId: string): Table | undefined {
    const seat = this.seats.get(userId);
    return seat && this.tables.get(seat.tableKey);
  }

  private stateOf(table: Table): TableState {
    const { match } = table;
    const phase = match ? (match.state.phase === 'ended' ? 'ended' : 'playing') : table.left || table.right ? 'waiting' : 'free';
    return {
      tableKey: table.def.key,
      phase,
      left: table.left,
      right: table.right,
      score: match ? { ...match.state.score } : { left: 0, right: 0 },
    };
  }

  private begin(table: Table): void {
    this.stop(table);
    const { clock, scheduler } = this.host;
    const match: Match = { state: this.start(clock.now()), inputs: { left: 0, right: 0 }, timer: null, rematch: new Set() };
    table.match = match;
    match.timer = scheduler.setInterval(() => this.frame(table, match), PONG.FRAME_MS);
  }

  private stop(table: Table): void {
    table.match?.timer?.cancel();
    table.match = null;
  }

  private frame(table: Table, match: Match): void {
    const started = performance.now();
    const before = match.state;
    const inputs = {
      left: table.left === BOT ? botInput(before, 'left') : match.inputs.left,
      right: table.right === BOT ? botInput(before, 'right') : match.inputs.right,
    };
    const { state, events } = stepPong(before, inputs, this.host.clock.now());
    match.state = state;
    this.sendState(table, state);
    if (events.length > 0) {
      for (const id of [table.left, table.right].filter(isHuman)) {
        this.host.send(id, { t: 'game.events', tableKey: table.def.key, events });
      }
    }
    if (state.phase === 'ended') {
      match.timer?.cancel();
      match.timer = null;
    }
    const scored = before.score.left !== state.score.left || before.score.right !== state.score.right;
    if (scored || before.phase !== state.phase) this.changed(table);
    this.host.observeFrame?.((performance.now() - started) / 1000);
  }

  private sendState(table: Table, state: PongState): void {
    for (const id of [table.left, table.right].filter(isHuman)) {
      this.host.send(id, {
        t: 'game.state',
        tableKey: table.def.key,
        ack: table.acks.get(id) ?? 0,
        phase: state.phase,
        serveAt: state.serveAt,
        ball: state.ball,
        paddles: state.paddles,
        score: state.score,
        serverTs: state.at,
      });
    }
  }

  private changed(table: Table): void {
    this.host.broadcast({ t: 'table.state', table: this.stateOf(table) });
  }
}
