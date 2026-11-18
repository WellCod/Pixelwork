import { MIN_STEP_INTERVAL_MS, type ClientMsg, type Dir, type ServerMsg } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../app.ts';
import type { AppConfig } from '../config.ts';
import { createDb, type Db } from '../db.ts';
import { seedDemo } from '../demo.ts';
import { createTestDatabase, type TestDatabase } from './database.ts';
import type { MediaService } from '../realtime/media.ts';
import { ManualClock } from './manual-clock.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

export const TEST_CONFIG: AppConfig = {
  publicUrl: TEST_ORIGIN,
  cookieSecure: false,
  demoSpaceSlug: 'demo',
  livekit: { url: 'ws://localhost:7880', apiKey: 'devkey', apiSecret: 'secret' },
};

/** Mapa 10x8 com parede na borda, spawn em (1, 1) e três mesas na linha 1 com a cadeira embaixo. */
export const TEST_MAP = buildTestMap({
  spawns: [[1, 1]],
  desks: [
    { key: 'mesa-1', x: 3, y: 1, orientation: 'down' },
    { key: 'mesa-2', x: 5, y: 1, orientation: 'down' },
    { key: 'mesa-3', x: 7, y: 1, orientation: 'down' },
  ],
});

export interface TestServer {
  app: FastifyInstance;
  db: Db;
  clock: ManualClock;
  baseUrl: string;
  wsUrl: string;
  spaceId: string;
  stop: () => Promise<void>;
}

export interface TestServerOptions {
  map?: unknown;
  media?: MediaService;
}

export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const database: TestDatabase = await createTestDatabase();
  const conn = createDb(database.url);
  const spaceId = await seedDemo(conn.db, TEST_CONFIG.demoSpaceSlug, options.map ?? TEST_MAP);
  const clock = new ManualClock();
  const app = buildApp({
    db: conn.db,
    config: TEST_CONFIG,
    clock,
    scheduler: clock,
    ...(options.media ? { media: options.media } : {}),
  });
  const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    app,
    db: conn.db,
    clock,
    baseUrl,
    wsUrl: `${baseUrl.replace('http', 'ws')}/ws?space=${spaceId}`,
    spaceId,
    stop: async () => {
      await app.close();
      await conn.pool.end();
      await database.drop();
    },
  };
}

export interface Guest {
  id: string;
  cookie: string;
}

export async function loginGuest(server: TestServer): Promise<Guest> {
  const response = await fetch(`${server.baseUrl}/auth/guest`, {
    method: 'POST',
    headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
    body: '{}',
  });
  if (response.status !== 201) throw new Error(`login de convidado falhou: ${response.status}`);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const { id } = (await response.json()) as { id: string };
  return { id, cookie };
}

export async function api(
  server: TestServer,
  guest: Guest,
  method: string,
  path: string,
  body: unknown = {},
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', cookie: guest.cookie },
    body: method === 'GET' ? null : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as unknown) : null };
}

/** Cede o event loop até a condição valer; nenhum tempo de jogo passa aqui. */
export async function until(condition: () => boolean, attempts = 500): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('condição não atingida');
}

/** Cliente WebSocket de teste usando os tipos do protocolo. */
export class Bot {
  readonly inbox: ServerMsg[] = [];
  private waiters: { match: (m: ServerMsg) => boolean; resolve: (m: ServerMsg) => void }[] = [];
  readonly closed: Promise<number>;
  private seq = 0;

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (data) => {
      const msg = JSON.parse((data as Buffer).toString('utf8')) as ServerMsg;
      const waiter = this.waiters.find((w) => w.match(msg));
      if (waiter) {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        waiter.resolve(msg);
      } else {
        this.inbox.push(msg);
      }
    });
    this.closed = new Promise((resolve) => ws.on('close', (code) => resolve(code)));
  }

  static connect(server: TestServer, guest: Guest, origin = TEST_ORIGIN): Promise<Bot> {
    const ws = new WebSocket(server.wsUrl, { headers: { cookie: guest.cookie, origin } });
    return new Promise((resolve, reject) => {
      ws.once('open', () => resolve(new Bot(ws)));
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once('error', reject);
    });
  }

  /** Próxima mensagem que satisfaz o filtro, incluindo as que já chegaram. */
  next<T extends ServerMsg['t']>(
    t: T,
    filter: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMsg, { t: T }>> {
    const match = (m: ServerMsg): m is Extract<ServerMsg, { t: T }> =>
      m.t === t && filter(m as Extract<ServerMsg, { t: T }>);
    const index = this.inbox.findIndex(match);
    if (index >= 0) {
      const [msg] = this.inbox.splice(index, 1);
      return Promise.resolve(msg as Extract<ServerMsg, { t: T }>);
    }
    return new Promise((resolve) => {
      this.waiters.push({ match, resolve: (m) => resolve(m as Extract<ServerMsg, { t: T }>) });
    });
  }

  /** Anda passo a passo, esperando o servidor processar e o intervalo mínimo passar. */
  async walk(clock: ManualClock, dirs: readonly Dir[]): Promise<void> {
    for (const dir of dirs) {
      this.send({ t: 'move', seq: ++this.seq, dir });
      await this.flush();
      clock.advance(MIN_STEP_INTERVAL_MS);
    }
  }

  send(msg: ClientMsg | string): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  /**
   * Garante que o servidor já processou tudo que foi enviado antes: o pong só volta
   * depois que os frames anteriores foram lidos, e o handler de mensagem é síncrono.
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.ws.once('pong', () => resolve());
      this.ws.ping();
    });
  }

  close(): Promise<number> {
    this.ws.close();
    return this.closed;
  }
}
