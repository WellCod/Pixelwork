import { MIN_STEP_INTERVAL_MS, decodeTick, type ClientMsg, type Dir, type ServerMsg } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../app.ts';
import type { AppConfig } from '../config.ts';
import { createDb, type Db } from '../db.ts';
import { seedDemo } from '../demo.ts';
import { createTestDatabase, type TestDatabase } from './database.ts';
import type { GitHubClient } from '../auth/github.ts';
import type { MediaService } from '../realtime/media.ts';
import { ManualClock } from './manual-clock.ts';

export const TEST_ORIGIN = 'http://localhost:5173';

export const TEST_CONFIG: AppConfig = {
  publicUrl: TEST_ORIGIN,
  cookieSecure: false,
  demoSpaceSlug: 'demo',
  livekit: { url: 'ws://localhost:7880', apiKey: 'devkey', apiSecret: 'secret' },
  github: { clientId: 'client-test', clientSecret: 'secret-test' },
  trustProxy: false,
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
  github?: GitHubClient;
  rateLimit?: boolean;
}

/** App inteiro numa porta livre, com banco próprio já com a demo semeada e relógio manual. */
export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const database: TestDatabase = await createTestDatabase();
  const databaseHandle = createDb(database.url);
  const spaceId = await seedDemo(databaseHandle.db, TEST_CONFIG.demoSpaceSlug, options.map ?? TEST_MAP);
  const clock = new ManualClock();
  const app = buildApp({
    db: databaseHandle.db,
    config: TEST_CONFIG,
    clock,
    scheduler: clock,
    rateLimit: options.rateLimit ?? false,
    ...(options.media ? { media: options.media } : {}),
    ...(options.github ? { github: options.github } : {}),
  });
  const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    app,
    db: databaseHandle.db,
    clock,
    baseUrl,
    wsUrl: `${baseUrl.replace('http', 'ws')}/ws?space=${spaceId}`,
    spaceId,
    stop: async () => {
      await app.close();
      await databaseHandle.pool.end();
      await database.drop();
    },
  };
}

export interface Guest {
  id: string;
  cookie: string;
}

/** Entra como convidado na demo e devolve o cookie de sessão pronto para os cabeçalhos. */
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

/** Requisição autenticada com a origem e o tipo que os guards exigem; corpo vazio vira null. */
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
  /** Quem está esperando uma mensagem com `next`; a mensagem que casa vai para o primeiro, não para a inbox. */
  private waiters: { match: (message: ServerMsg) => boolean; resolve: (message: ServerMsg) => void }[] = [];
  readonly closed: Promise<number>;
  private seq = 0;

  /** Id curto -> id, para decodificar o tick binário como o cliente faz. */
  private readonly shortIds = new Map<number, string>();

  private constructor(readonly socket: WebSocket) {
    socket.on('message', (rawMessage, isBinary) => {
      const message = isBinary
        ? this.tickFrom(rawMessage as Buffer)
        : (JSON.parse((rawMessage as Buffer).toString('utf8')) as ServerMsg);
      if (!message) throw new Error('tick binário inválido');
      // Mantém o mapa de ids curtos em dia, como o cliente de verdade.
      if (message.t === 'welcome') {
        this.shortIds.clear();
        for (const player of message.players) this.shortIds.set(player.n, player.id);
      }
      if (message.t === 'player.join') this.shortIds.set(message.player.n, message.player.id);
      const waiter = this.waiters.find((pendingWaiter) => pendingWaiter.match(message));
      if (waiter) {
        this.waiters = this.waiters.filter((pendingWaiter) => pendingWaiter !== waiter);
        waiter.resolve(message);
      } else {
        this.inbox.push(message);
      }
    });
    this.closed = new Promise((resolve) => socket.on('close', (code) => resolve(code)));
  }

  /** Abre o WebSocket com o cookie do convidado; resposta HTTP no lugar do upgrade rejeita com o status. */
  static connect(server: TestServer, guest: Guest, origin = TEST_ORIGIN): Promise<Bot> {
    const socket = new WebSocket(server.wsUrl, { headers: { cookie: guest.cookie, origin } });
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(new Bot(socket)));
      socket.once('unexpected-response', (_request, response) => reject(new Error(`HTTP ${response.statusCode}`)));
      socket.once('error', reject);
    });
  }

  /** Tick binário convertido para a forma JSON, com ids curtos trocados pelos ids de usuário. */
  private tickFrom(frame: Buffer): ServerMsg | null {
    const tick = decodeTick(frame);
    if (!tick) return null;
    return {
      t: 'tick',
      ack: tick.ack,
      ts: tick.ts,
      moves: tick.moves.map(([shortId, x, y, dir]) => [this.shortIds.get(shortId) ?? `?${shortId}`, x, y, dir]),
    };
  }

  /** Próxima mensagem que satisfaz o filtro, incluindo as que já chegaram. */
  next<T extends ServerMsg['t']>(
    type: T,
    filter: (message: Extract<ServerMsg, { t: T }>) => boolean = () => true,
  ): Promise<Extract<ServerMsg, { t: T }>> {
    const match = (message: ServerMsg): message is Extract<ServerMsg, { t: T }> =>
      message.t === type && filter(message as Extract<ServerMsg, { t: T }>);
    const index = this.inbox.findIndex(match);
    if (index >= 0) {
      const [message] = this.inbox.splice(index, 1);
      return Promise.resolve(message as Extract<ServerMsg, { t: T }>);
    }
    return new Promise((resolve) => {
      this.waiters.push({ match, resolve: (message) => resolve(message as Extract<ServerMsg, { t: T }>) });
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

  /** Texto cru passa direto, para os testes de mensagem inválida. */
  send(message: ClientMsg | string): void {
    this.socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  }

  /**
   * Garante que o servidor já processou tudo que foi enviado antes: o pong só volta
   * depois que os frames anteriores foram lidos, e o handler de mensagem é síncrono.
   */
  flush(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once('pong', () => resolve());
      this.socket.ping();
    });
  }

  close(): Promise<number> {
    this.socket.close();
    return this.closed;
  }
}
