import { RECONNECT_GRACE_MS, frameOf, type Dir } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, api, loginGuest, startTestServer, until, type Guest, type TestServer } from '../test/harness.ts';

/**
 * 12x9 com borda; mesa de pingpong em x 4..6, y 3..4; lados em x=3 e x=7. Mesa de trabalho em
 * (1, 6), cadeira em (1, 7). Spawn em (1, 1).
 */
const GAMES_MAP = buildTestMap({
  width: 12,
  height: 9,
  desks: [{ key: 'mesa-1', x: 1, y: 6, orientation: 'down' }],
  furniture: [{ tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'ping-pong'), x: 4, y: 4, w: 3, h: 2 }],
  spawns: [[1, 1]],
});
const KEY = 'ping-pong@4,3';
const TO_LEFT: Dir[] = ['right', 'right', 'down', 'down'];
const TO_RIGHT: Dir[] = ['right', 'right', 'right', 'right', 'right', 'right', 'down', 'down'];

describe('pingpong no runtime', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer({ map: GAMES_MAP, media: new FakeMedia() });
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  async function online(): Promise<{ guest: Guest; bot: Bot }> {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    await bot.next('welcome');
    return { guest, bot };
  }

  it('partida 1x1 de ponta a ponta', async () => {
    const a = await online();
    const b = await online();
    const c = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    await b.bot.walk(server.clock, TO_RIGHT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    b.bot.send({ t: 'game.join', tableKey: KEY });
    await a.bot.flush();
    await b.bot.flush();
    const table = await c.bot.next('table.state', (m) => m.table.phase === 'playing');
    expect(table.table).toMatchObject({ tableKey: KEY, left: a.guest.id, right: b.guest.id });
    const activity = await c.bot.next('player.update', (m) => m.id === a.guest.id && m.patch.activity === 'game');
    expect(activity.patch.activity).toBe('game');

    a.bot.send({ t: 'game.input', seq: 1, dir: 1 });
    await a.bot.flush();
    server.clock.advance(1000);
    const state = await b.bot.next('game.state', (m) => m.paddles.left > 45);
    expect(state).toMatchObject({ tableKey: KEY, paddles: { right: 45 } });
  });

  it('move de quem está na mesa não anda', async () => {
    const a = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    await a.bot.flush();
    await a.bot.walk(server.clock, ['up', 'up']);
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(a.guest.id)).toEqual({ x: 3, y: 3 });
  });

  it('entrar longe da mesa dá erro', async () => {
    const a = await online();
    a.bot.send({ t: 'game.join', tableKey: KEY });
    expect(await a.bot.next('error')).toEqual({ t: 'error', code: 'table_not_at_side' });
  });

  it('tolerância expirada dá vitória ao outro', async () => {
    const a = await online();
    const b = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    await b.bot.walk(server.clock, TO_RIGHT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    b.bot.send({ t: 'game.join', tableKey: KEY });
    await a.bot.flush();
    await b.bot.flush();
    a.bot.ws.terminate();
    bots.splice(bots.indexOf(a.bot), 1);
    await until(() => server.app.realtime.connections() === 1);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
    const end = await b.bot.next('game.events', (m) => m.events.some((e) => e.type === 'end'));
    expect(end.events).toContainEqual({ type: 'end', winner: 'right' });
    const waiting = await b.bot.next('table.state', (m) => m.table.phase === 'waiting' && m.table.left === null);
    expect(waiting.table.right).toBe(b.guest.id);
  });

  it('reconexão devolve a mesa no welcome', async () => {
    const a = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    await a.bot.flush();
    a.bot.ws.terminate();
    bots.splice(bots.indexOf(a.bot), 1);
    await until(() => server.app.realtime.connections() === 0);
    const again = await Bot.connect(server, a.guest);
    bots.push(again);
    expect((await again.next('welcome')).game).toEqual({ tableKey: KEY, side: 'left' });
  });

  it('convite para quem joga dá busy', async () => {
    const a = await online();
    const b = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    await a.bot.flush();
    // Para ligar é preciso estar sentado à própria mesa.
    await b.bot.walk(server.clock, ['right', 'down', 'down', 'down', 'down', 'down', 'down', 'left']);
    expect((await api(server, b.guest, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
    b.bot.send({ t: 'call.invite', userId: a.guest.id });
    expect(await b.bot.next('call.ended')).toMatchObject({ reason: 'busy' });
  });

  it('/metrics mostra partidas ativas', async () => {
    const a = await online();
    await a.bot.walk(server.clock, TO_LEFT);
    a.bot.send({ t: 'game.join', tableKey: KEY });
    a.bot.send({ t: 'game.bot' });
    await a.bot.flush();
    const text = await (await fetch(`${server.baseUrl}/metrics`)).text();
    expect(text).toContain('pixelwork_games_active 1');
    expect(text).toContain('pixelwork_game_frame_seconds_count');
  });
});

