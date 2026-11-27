import { monitorEventLoopDelay } from 'node:perf_hooks';

/** Limites do histograma da duração do tick, em segundos (o tick roda a cada 100 ms). */
const TICK_BUCKETS = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1];

/** Histograma no formato do Prometheus: cada balde conta as observações até o seu limite (acumulado). */
class Histogram {
  readonly counts: number[];
  sum = 0;
  count = 0;

  constructor(readonly buckets: readonly number[]) {
    this.counts = buckets.map(() => 0);
  }

  observe(value: number): void {
    this.sum += value;
    this.count++;
    this.buckets.forEach((limit, i) => {
      if (value <= limit) this.counts[i] = (this.counts[i] ?? 0) + 1;
    });
  }
}

export interface Gauges {
  connections: number;
  runtimes: number;
  players: number;
  games: number;
}

/**
 * Métricas do processo no formato de texto do Prometheus, sem dependência: contadores e um
 * histograma escritos à mão. Uma instância por app; os testes criam a sua.
 */
export class Metrics {
  readonly tick = new Histogram(TICK_BUCKETS);
  /** Quadro de uma partida de pingpong (30 Hz); mesmos limites do tick. */
  readonly gameFrame = new Histogram(TICK_BUCKETS);
  readonly receptionStartup = new Histogram([0.25, 0.5, 1, 2, 4, 8, 15, 25]);
  readonly receptionSessions = new Map<string, number>();
  messagesIn = 0;
  messagesOut = 0;
  bytesOut = 0;
  mediaTokens = 0;
  connectionsOpened = 0;
  private readonly eventLoopDelay = monitorEventLoopDelay({ resolution: 10 });

  constructor() {
    this.eventLoopDelay.enable();
  }

  stop(): void {
    this.eventLoopDelay.disable();
  }

  /** Texto do GET /metrics; os gauges vêm de fora porque esse estado mora no gateway. */
  render(gauges: Gauges): string {
    const lines: string[] = [];
    const writeMetric = (name: string, type: string, help: string, value: number | string) => {
      lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name} ${value}`);
    };
    writeMetric('pixelwork_ws_connections', 'gauge', 'WebSockets abertos.', gauges.connections);
    writeMetric('pixelwork_ws_connections_opened_total', 'counter', 'WebSockets aceitos desde o início.', this.connectionsOpened);
    writeMetric('pixelwork_runtimes_loaded', 'gauge', 'Coworkings com estado em memória.', gauges.runtimes);
    writeMetric('pixelwork_players', 'gauge', 'Jogadores nos mapas, incluindo a tolerância de reconexão.', gauges.players);
    writeMetric('pixelwork_ws_messages_received_total', 'counter', 'Mensagens recebidas dos clientes.', this.messagesIn);
    writeMetric('pixelwork_ws_messages_sent_total', 'counter', 'Mensagens enviadas aos clientes.', this.messagesOut);
    writeMetric('pixelwork_ws_bytes_sent_total', 'counter', 'Bytes enviados aos clientes.', this.bytesOut);
    writeMetric('pixelwork_media_tokens_total', 'counter', 'Tokens do LiveKit emitidos.', this.mediaTokens);
    lines.push('# HELP pixelwork_reception_sessions_total Eventos de sessão da recepção por voz.',
      '# TYPE pixelwork_reception_sessions_total counter');
    for (const [outcome, count] of this.receptionSessions) {
      lines.push(`pixelwork_reception_sessions_total{outcome="${outcome}"} ${count}`);
    }
    lines.push('# HELP pixelwork_reception_startup_seconds Tempo da solicitação até o worker pronto.',
      '# TYPE pixelwork_reception_startup_seconds histogram');
    this.receptionStartup.buckets.forEach((limit, i) => {
      lines.push(`pixelwork_reception_startup_seconds_bucket{le="${limit}"} ${this.receptionStartup.counts[i] ?? 0}`);
    });
    lines.push(
      `pixelwork_reception_startup_seconds_bucket{le="+Inf"} ${this.receptionStartup.count}`,
      `pixelwork_reception_startup_seconds_sum ${this.receptionStartup.sum}`,
      `pixelwork_reception_startup_seconds_count ${this.receptionStartup.count}`,
    );

    lines.push(
      '# HELP pixelwork_tick_duration_seconds Duração do tick de um coworking.',
      '# TYPE pixelwork_tick_duration_seconds histogram',
    );
    this.tick.buckets.forEach((limit, i) => {
      lines.push(`pixelwork_tick_duration_seconds_bucket{le="${limit}"} ${this.tick.counts[i] ?? 0}`);
    });
    lines.push(
      `pixelwork_tick_duration_seconds_bucket{le="+Inf"} ${this.tick.count}`,
      `pixelwork_tick_duration_seconds_sum ${this.tick.sum}`,
      `pixelwork_tick_duration_seconds_count ${this.tick.count}`,
    );

    writeMetric('pixelwork_games_active', 'gauge', 'Partidas de pingpong em andamento.', gauges.games);
    lines.push(
      '# HELP pixelwork_game_frame_seconds Duração de um quadro de partida de pingpong.',
      '# TYPE pixelwork_game_frame_seconds histogram',
    );
    this.gameFrame.buckets.forEach((limit, i) => {
      lines.push(`pixelwork_game_frame_seconds_bucket{le="${limit}"} ${this.gameFrame.counts[i] ?? 0}`);
    });
    lines.push(
      `pixelwork_game_frame_seconds_bucket{le="+Inf"} ${this.gameFrame.count}`,
      `pixelwork_game_frame_seconds_sum ${this.gameFrame.sum}`,
      `pixelwork_game_frame_seconds_count ${this.gameFrame.count}`,
    );

    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    writeMetric('process_resident_memory_bytes', 'gauge', 'Memória residente.', memory.rss);
    writeMetric('nodejs_heap_used_bytes', 'gauge', 'Heap em uso.', memory.heapUsed);
    writeMetric('process_cpu_seconds_total', 'counter', 'CPU de usuário e sistema.', (cpu.user + cpu.system) / 1e6);
    writeMetric('nodejs_eventloop_delay_p99_seconds', 'gauge', 'Atraso do event loop, percentil 99.', this.eventLoopDelay.percentile(99) / 1e9);
    return `${lines.join('\n')}\n`;
  }
}
