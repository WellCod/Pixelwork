import { CLOSE_SESSION_ENDED, RECONNECT_GRACE_MS } from '@pixelwork/shared';
import { sessions } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import net from 'node:net';
import WebSocket from 'ws';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Bot, TEST_ORIGIN, api, loginGuest, startTestServer, until, type TestServer } from '../test/harness.ts';

describe('resiliência do gateway', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  function upgradeStatus(url: string, cookie: string): Promise<number> {
    const socket = new WebSocket(url, { headers: { cookie, origin: TEST_ORIGIN } });
    return new Promise((resolve) => {
      socket.once('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0));
      socket.once('open', () => {
        socket.terminate();
        resolve(101);
      });
    });
  }

  it('upgrade para coworking de que não é membro, ou id malformado, dá 404', async () => {
    const guest = await loginGuest(server);
    const base = `${server.baseUrl.replace('http', 'ws')}/ws?space=`;
    expect(await upgradeStatus(`${base}00000000-0000-7000-8000-000000000000`, guest.cookie)).toBe(404);
    expect(await upgradeStatus(`${base}nao-e-uuid`, guest.cookie)).toBe(404);
  });

  it('cliente que derruba o TCP durante o upgrade não derruba o servidor', async () => {
    const guest = await loginGuest(server);
    const { port } = new URL(server.baseUrl);
    const path = new URL(server.wsUrl).pathname + new URL(server.wsUrl).search;
    for (let i = 0; i < 5; i++) {
      // RST logo depois do pedido, enquanto o servidor ainda consulta sessão e participação.
      const socket = net.connect(Number(port), '127.0.0.1');
      socket.on('error', () => undefined);
      await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n` +
          `Origin: ${TEST_ORIGIN}\r\nCookie: ${guest.cookie}\r\n\r\n`,
      );
      await new Promise((resolve) => setImmediate(resolve));
      socket.resetAndDestroy();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    expect((await bot.next('welcome')).selfId).toBe(guest.id);
  });

  it('logout fecha o WebSocket aberto com a mesma sessão', async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    await bot.next('welcome');
    await api(server, guest, 'POST', '/auth/logout');
    expect(await bot.closed).toBe(CLOSE_SESSION_ENDED);
  });

  it('sessão que expira com a conexão aberta é fechada na varredura', async () => {
    const guest = await loginGuest(server);
    await server.db
      .update(sessions)
      .set({ expiresAt: new Date(server.clock.now() + 1_000) })
      .where(eq(sessions.userId, guest.id));
    const bot = await Bot.connect(server, guest);
    await bot.next('welcome');
    server.clock.advance(1_001);
    server.app.realtime.sweep();
    expect(await bot.closed).toBe(CLOSE_SESSION_ENDED);
  });

  it('falha do banco ao carregar o runtime não derruba o processo e não fica em cache', async () => {
    const fresh = await startTestServer();
    try {
      const guest = await loginGuest(fresh);
      const select = fresh.db.select.bind(fresh.db);
      let failures = 1;
      const spy = vi.spyOn(fresh.db, 'select').mockImplementation(((fields?: Record<string, unknown>) => {
        if (fields && 'mapVersion' in fields && failures-- > 0) throw new Error('banco fora do ar');
        return select(fields as never);
      }));
      await expect(Bot.connect(fresh, guest)).rejects.toThrow('HTTP 500');
      const bot = await Bot.connect(fresh, guest);
      expect((await bot.next('welcome')).selfId).toBe(guest.id);
      spy.mockRestore();
      await bot.close();
    } finally {
      await fresh.stop();
    }
  });

  it('runtime sem ninguém sai da memória depois do tempo ocioso', async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    await bot.next('welcome');
    expect(server.app.realtime.runtime(server.spaceId)).toBeDefined();
    await bot.close();
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
    server.app.realtime.sweep();
    server.clock.advance(10 * 60_000);
    server.app.realtime.sweep();
    expect(server.app.realtime.runtime(server.spaceId)).toBeUndefined();

    // E volta a carregar na próxima conexão.
    const again = await Bot.connect(server, guest);
    bots.push(again);
    expect((await again.next('welcome')).selfId).toBe(guest.id);
  });
});

describe('limite de taxa', () => {
  it('POST /auth/guest recusa com 429 depois do limite por IP', async () => {
    const server = await startTestServer({ rateLimit: true });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const response = await fetch(`${server.baseUrl}/auth/guest`, {
          method: 'POST',
          headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
          body: '{}',
        });
        statuses.push(response.status);
      }
      expect(statuses.slice(0, 10).every((status) => status === 201)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await server.stop();
    }
  });
});

describe('métricas', () => {
  it('/metrics expõe conexões, jogadores, mensagens e o histograma do tick', async () => {
    const server = await startTestServer();
    try {
      const guest = await loginGuest(server);
      const bot = await Bot.connect(server, guest);
      await bot.next('welcome');
      bot.send({ t: 'move', seq: 1, dir: 'down' });
      await bot.flush();
      server.clock.advance(100);
      await bot.next('tick');
      const text = await (await fetch(`${server.baseUrl}/metrics`)).text();
      expect(text).toContain('pixelwork_ws_connections 1');
      expect(text).toContain('pixelwork_players 1');
      expect(text).toMatch(/pixelwork_ws_messages_received_total [1-9]/);
      expect(text).toMatch(/pixelwork_media_tokens_total [1-9]/);
      expect(text).toMatch(/pixelwork_tick_duration_seconds_count [1-9]/);
      expect(text).toContain('# TYPE pixelwork_tick_duration_seconds histogram');
      await bot.close();
    } finally {
      await server.stop();
    }
  });
});
