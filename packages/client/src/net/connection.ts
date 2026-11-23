import {
  CLOSE_REMOVED,
  CLOSE_SESSION_ENDED,
  CLOSE_SESSION_REPLACED,
  CONNECTION_TIMEOUT_MS,
  PING_INTERVAL_MS,
  decodeTick,
  type ClientMsg,
  type ServerMsg,
} from '@pixelwork/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'replaced' | 'removed' | 'ended';

const MAX_BACKOFF_MS = 10_000;
/** Fechamentos em que o cliente não reconecta. */
const FINAL_CLOSE: Partial<Record<number, ConnectionStatus>> = {
  [CLOSE_SESSION_REPLACED]: 'replaced',
  [CLOSE_REMOVED]: 'removed',
  [CLOSE_SESSION_ENDED]: 'ended',
};
/** Amostras de RTT guardadas para a média e o jitter do HUD. */
const RTT_SAMPLES = 10;

export interface NetStats {
  /** Último RTT medido pelo ping de aplicação, em ms. */
  rtt: number | null;
  /** Média das últimas amostras. */
  rttAvg: number | null;
  /** Desvio médio entre amostras consecutivas. */
  jitter: number | null;
  /** Diferença estimada entre o relógio do servidor e o local (servidor - local), em ms. */
  clockOffset: number | null;
}

/**
 * WebSocket do coworking com reconexão por backoff exponencial. Um `ping` de aplicação a cada
 * `PING_INTERVAL_MS` mede o RTT; sem nenhuma mensagem por `CONNECTION_TIMEOUT_MS`, a conexão é
 * dada como morta (Wi-Fi caiu sem `close`) e refeita.
 */
export class Connection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private lastMessageAt = 0;
  private pingId = 0;
  private readonly pings = new Map<number, number>();
  private readonly samples: number[] = [];
  status: ConnectionStatus = 'connecting';
  readonly stats: NetStats = { rtt: null, rttAvg: null, jitter: null, clockOffset: null };

  constructor(
    private readonly spaceId: string,
    private readonly onMessage: (message: ServerMsg) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
    /** Atraso artificial de envio e recebimento (overlay de netcode em desenvolvimento). */
    private readonly lag: () => number = () => 0,
    /** Id curto -> id completo, para o tick binário. */
    private readonly idOf: (shortId: number) => string | undefined = () => undefined,
  ) {}

  open(): void {
    this.stopped = false;
    window.addEventListener('online', this.onOnline);
    this.connect();
  }

  private connect(): void {
    const url = new URL(`/ws?space=${encodeURIComponent(this.spaceId)}`, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.lastMessageAt = performance.now();
    this.setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    // Cada handler confere se o socket ainda é o atual: um socket substituído pode seguir emitindo
    // eventos até fechar de vez.
    socket.onopen = () => {
      if (this.socket === socket) this.startHeartbeat();
    };
    socket.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (this.socket !== socket) return;
      this.lastMessageAt = performance.now();
      const payload = event.data;
      if (payload instanceof ArrayBuffer) {
        // O id curto é resolvido na entrega, depois do atraso simulado, com o mapa de ids daquele momento.
        this.delay(() => {
          const message = this.tickFrom(payload);
          if (message) this.receive(message);
        }, 'in');
        return;
      }
      let message: ServerMsg;
      try {
        message = JSON.parse(payload) as ServerMsg;
      } catch {
        return;
      }
      this.delay(() => this.receive(message), 'in');
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      if (this.stopped) return;
      const finalStatus = FINAL_CLOSE[event.code];
      if (finalStatus) this.setStatus(finalStatus);
      else this.scheduleRetry();
    };
  }

  /** Tick binário -> mensagem `tick` com os ids completos; movimento de id desconhecido é descartado. */
  private tickFrom(data: ArrayBuffer): ServerMsg | null {
    const tick = decodeTick(data);
    if (!tick) return null;
    const moves: [string, number, number, (typeof tick.moves)[number][3]][] = [];
    for (const [shortId, x, y, dir] of tick.moves) {
      const id = this.idOf(shortId);
      if (id) moves.push([id, x, y, dir]);
    }
    return { t: 'tick', ack: tick.ack, ts: tick.ts, moves };
  }

  private receive(message: ServerMsg): void {
    if (message.t === 'pong') {
      this.onPong(message.id, message.ts);
      return;
    }
    if (message.t === 'welcome') {
      this.attempt = 0;
      this.setStatus('online');
    }
    this.onMessage(message);
  }

  /** Backoff exponencial a partir de 500 ms, com teto em MAX_BACKOFF_MS. */
  private scheduleRetry(): void {
    const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt);
    this.attempt++;
    this.setStatus('reconnecting');
    this.retry = setTimeout(() => {
      this.retry = null;
      this.connect();
    }, delay);
  }

  /** A rede voltou: tenta já, sem esperar o backoff. */
  private readonly onOnline = () => {
    if (this.stopped || this.socket) return;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.connect();
  };

  /** Derruba e reconecta na hora; o servidor manda `welcome` e um `media.join` novo. */
  reconnect(): void {
    if (this.stopped) return;
    const socket = this.socket;
    this.socket = null;
    this.stopHeartbeat();
    socket?.close();
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.connect();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (performance.now() - this.lastMessageAt > CONNECTION_TIMEOUT_MS) {
        // Conexão meio aberta: o navegador ainda acha que está aberta.
        const socket = this.socket;
        this.socket = null;
        this.stopHeartbeat();
        socket?.close();
        this.scheduleRetry();
        return;
      }
      const id = ++this.pingId;
      this.pings.set(id, performance.now());
      this.send({ t: 'ping', id });
    }, PING_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.pings.clear();
  }

  /** Fecha a medição do ping: atualiza RTT, média, jitter e a estimativa de diferença de relógio. */
  private onPong(id: number, serverTs: number): void {
    const sentAt = this.pings.get(id);
    if (sentAt === undefined) return;
    this.pings.delete(id);
    const now = performance.now();
    const rtt = now - sentAt;
    this.samples.push(rtt);
    if (this.samples.length > RTT_SAMPLES) this.samples.shift();
    const average = this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
    let jitter = 0;
    for (let i = 1; i < this.samples.length; i++) {
      jitter += Math.abs((this.samples[i] ?? 0) - (this.samples[i - 1] ?? 0));
    }
    this.stats.rtt = rtt;
    this.stats.rttAvg = average;
    this.stats.jitter = this.samples.length > 1 ? jitter / (this.samples.length - 1) : 0;
    // Hora do servidor no meio da ida e volta.
    this.stats.clockOffset = serverTs - (Date.now() - rtt / 2);
  }

  /** Mede um RTT agora, sem esperar o próximo intervalo (o HUD chama ao abrir). */
  pingNow(): void {
    const id = ++this.pingId;
    this.pings.set(id, performance.now());
    this.send({ t: 'ping', id });
  }

  /** Envia se a conexão estiver aberta; fora do ar a mensagem é descartada. */
  send(message: ClientMsg): void {
    const socket = this.socket;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const serialized = JSON.stringify(message);
    this.delay(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    }, 'out');
  }

  get online(): boolean {
    return this.status === 'online';
  }

  /** Hora da última entrega agendada em cada direção, para o atraso simulado não inverter a ordem. */
  private readonly lastAt = { in: 0, out: 0 };

  /** Atraso simulado que preserva a ordem, como o TCP: nada é entregue antes do anterior. */
  private delay(deliver: () => void, direction: 'in' | 'out'): void {
    const lagMs = this.lag();
    if (lagMs <= 0 && this.lastAt[direction] <= performance.now()) {
      deliver();
      return;
    }
    const deliverAt = Math.max(performance.now() + lagMs, this.lastAt[direction]);
    this.lastAt[direction] = deliverAt;
    setTimeout(deliver, deliverAt - performance.now());
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    this.onStatus(status);
  }

  close(): void {
    this.stopped = true;
    window.removeEventListener('online', this.onOnline);
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }
}
