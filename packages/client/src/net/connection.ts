import { CLOSE_SESSION_REPLACED, type ClientMsg, type ServerMsg } from '@pixelwork/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'replaced';

const MAX_BACKOFF_MS = 10_000;

/** WebSocket do coworking com reconexão por backoff exponencial. */
export class Connection {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(
    private readonly spaceId: string,
    private readonly onMessage: (msg: ServerMsg) => void,
    private readonly onStatus: (status: ConnectionStatus) => void,
  ) {}

  open(): void {
    this.stopped = false;
    const url = new URL(`/ws?space=${encodeURIComponent(this.spaceId)}`, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    this.ws = ws;
    this.onStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');

    ws.onmessage = (event: MessageEvent<string>) => {
      const msg = JSON.parse(event.data) as ServerMsg;
      if (msg.t === 'welcome') {
        this.attempt = 0;
        this.onStatus('online');
      }
      this.onMessage(msg);
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (event.code === CLOSE_SESSION_REPLACED) {
        this.onStatus('replaced');
        return;
      }
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempt);
      this.attempt++;
      this.onStatus('reconnecting');
      this.retry = setTimeout(() => this.open(), delay);
    };
  }

  send(msg: ClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.ws?.close();
    this.ws = null;
  }
}
