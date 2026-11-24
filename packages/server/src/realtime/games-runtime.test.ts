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
  furniture: [
    { tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'ping-pong'), x: 4, y: 4, w: 3, h: 2 },
    { tileset: 'furniture-3x2', tile: frameOf('furniture-3x2', 'foosball'), x: 8, y: 5, w: 3, h: 2 },
  ],
  spawns: [[1, 1]],
});
const KEY = 'ping-pong@4,3';
const FOOSBALL_KEY = 'foosball@8,4';
const TO_FOOSBALL_LEFT: Dir[] = ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'down', 'down'];
const TO_FOOSBALL_RIGHT: Dir[] = ['right', 'right', 'right', 'right', 'right', 'right', 'down', 'down', 'down', 'down', 'down', 'right'];
const TO_LEFT: Dir[] = ['right', 'right', 'down', 'down'];
const TO_RIGHT: Dir[] = ['right', 'right', 'right', 'right', 'right', 'right', 'down', 'down'];

describe('mesas de jogo no runtime', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer({ map: GAMES_MAP, media: new FakeMedia() });
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
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
    const alice = await online();
    const bob = await online();
    const carol = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    await bob.bot.walk(server.clock, TO_RIGHT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    bob.bot.send({ t: 'game.join', tableKey: KEY });
    await alice.bot.flush();
    await bob.bot.flush();
    const table = await carol.bot.next('table.state', (message) => message.table.phase === 'playing');
    expect(table.table).toMatchObject({ tableKey: KEY, left: alice.guest.id, right: bob.guest.id });
    const activity = await carol.bot.next('player.update', (message) => message.id === alice.guest.id && message.patch.activity === 'game');
    expect(activity.patch.activity).toBe('game');

    alice.bot.send({ t: 'game.input', seq: 1, dir: 1 });
    await alice.bot.flush();
    server.clock.advance(1000);
    const state = await bob.bot.next('game.state', (message) => (message.paddles?.left ?? 0) > 45);
    expect(state).toMatchObject({ tableKey: KEY, paddles: { right: 45 } });
  });

  it('pebolim contra o bot sincroniza hastes e aceita o comando de chute', async () => {
    const alice = await online();
    await alice.bot.walk(server.clock, TO_FOOSBALL_LEFT);
    alice.bot.send({ t: 'game.join', tableKey: FOOSBALL_KEY });
    alice.bot.send({ t: 'game.bot' });
    await alice.bot.flush();
    expect((await alice.bot.next('table.state', (message) => message.table.right === 'bot')).table.tableKey).toBe(FOOSBALL_KEY);
    alice.bot.send({ t: 'game.input', seq: 1, dir: 1 });
    await alice.bot.flush();
    server.clock.advance(3050);
    const state = await alice.bot.next('game.state', (message) => message.phase === 'playing');
    expect(state).toMatchObject({ tableKey: FOOSBALL_KEY, ack: 1, foosball: { rods: { left: 62 } } });
    alice.bot.send({ t: 'game.kick' });
    await alice.bot.flush();
    server.clock.advance(100);
    const kicked = await alice.bot.next('game.state', (message) => typeof message.foosball?.kickAt.left === 'number');
    expect(kicked.tableKey).toBe(FOOSBALL_KEY);
  });

  it('pebolim entre duas pessoas ativa a mesma mesa e encerra por desistência', async () => {
    const alice = await online();
    const bob = await online();
    await alice.bot.walk(server.clock, TO_FOOSBALL_LEFT);
    await bob.bot.walk(server.clock, TO_FOOSBALL_RIGHT);
    alice.bot.send({ t: 'game.join', tableKey: FOOSBALL_KEY });
    bob.bot.send({ t: 'game.join', tableKey: FOOSBALL_KEY });
    await alice.bot.flush();
    await bob.bot.flush();
    expect((await bob.bot.next('table.state', (message) => message.table.phase === 'playing')).table)
      .toMatchObject({ tableKey: FOOSBALL_KEY, left: alice.guest.id, right: bob.guest.id });
    server.clock.advance(100);
    expect(await bob.bot.next('game.state')).toMatchObject({ tableKey: FOOSBALL_KEY, foosball: { rods: { left: 45, right: 45 } } });
    alice.bot.send({ t: 'game.leave' });
    const end = await bob.bot.next('game.events', (message) => message.events.some((event) => event.type === 'end'));
    expect(end.events).toContainEqual({ type: 'end', winner: 'right' });
  });

  it('move de quem está na mesa não anda', async () => {
    const alice = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    await alice.bot.flush();
    await alice.bot.walk(server.clock, ['up', 'up']);
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(alice.guest.id)).toEqual({ x: 3, y: 3 });
  });

  it('entrar longe da mesa dá erro', async () => {
    const alice = await online();
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    expect(await alice.bot.next('error')).toEqual({ t: 'error', code: 'table_not_at_side' });
  });

  it('tolerância expirada dá vitória ao outro', async () => {
    const alice = await online();
    const bob = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    await bob.bot.walk(server.clock, TO_RIGHT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    bob.bot.send({ t: 'game.join', tableKey: KEY });
    await alice.bot.flush();
    await bob.bot.flush();
    alice.bot.socket.terminate();
    bots.splice(bots.indexOf(alice.bot), 1);
    await until(() => server.app.realtime.connections() === 1);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
    const end = await bob.bot.next('game.events', (message) => message.events.some((event) => event.type === 'end'));
    expect(end.events).toContainEqual({ type: 'end', winner: 'right' });
    const waiting = await bob.bot.next('table.state', (message) => message.table.phase === 'waiting' && message.table.left === null);
    expect(waiting.table.right).toBe(bob.guest.id);
  });

  it('reconexão devolve a mesa no welcome', async () => {
    const alice = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    await alice.bot.flush();
    alice.bot.socket.terminate();
    bots.splice(bots.indexOf(alice.bot), 1);
    await until(() => server.app.realtime.connections() === 0);
    const again = await Bot.connect(server, alice.guest);
    bots.push(again);
    expect((await again.next('welcome')).game).toEqual({ tableKey: KEY, side: 'left' });
  });

  it('convite para quem joga dá busy', async () => {
    const alice = await online();
    const bob = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    await alice.bot.flush();
    // Para ligar é preciso estar sentado à própria mesa.
    await bob.bot.walk(server.clock, ['right', 'down', 'down', 'down', 'down', 'down', 'down', 'left']);
    expect((await api(server, bob.guest, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
    bob.bot.send({ t: 'call.invite', userId: alice.guest.id });
    expect(await bob.bot.next('call.ended')).toMatchObject({ reason: 'busy' });
  });

  it('/metrics mostra partidas ativas', async () => {
    const alice = await online();
    await alice.bot.walk(server.clock, TO_LEFT);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    alice.bot.send({ t: 'game.bot' });
    await alice.bot.flush();
    const text = await (await fetch(`${server.baseUrl}/metrics`)).text();
    expect(text).toContain('pixelwork_games_active 1');
    expect(text).toContain('pixelwork_game_frame_seconds_count');
  });
});


it('inicia partida de pingpong acima e abaixo da mesa girada', async () => {
  const tileset = 'furniture-2x3';
  const map = buildTestMap({
    width: 12,
    height: 9,
    furniture: [{ tileset, tile: frameOf(tileset, 'ping-pong-vertical'), x: 4, y: 5, w: 2, h: 3 }],
    spawns: [[1, 1]],
  });
  const server = await startTestServer({ map, media: new FakeMedia() });
  const connected: Bot[] = [];
  const connect = async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    connected.push(bot);
    await bot.next('welcome');
    return { guest, bot };
  };
  try {
    const alice = await connect();
    const bob = await connect();
    await alice.bot.walk(server.clock, ['right', 'right', 'right', 'down']);
    await bob.bot.walk(server.clock, ['right', 'right', 'down', 'down', 'down']);
    alice.bot.send({ t: 'game.join', tableKey: KEY });
    bob.bot.send({ t: 'game.join', tableKey: KEY });
    expect(await bob.bot.next('error')).toEqual({ t: 'error', code: 'table_not_at_side' });
    await bob.bot.walk(server.clock, ['down', 'down', 'right']);
    bob.bot.send({ t: 'game.join', tableKey: KEY });
    const state = await alice.bot.next('table.state', (message) => message.table.phase === 'playing');
    expect(state.table).toMatchObject({ tableKey: KEY, left: alice.guest.id, right: bob.guest.id });
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(alice.guest.id)).toEqual({ x: 4, y: 2 });
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(bob.guest.id)).toEqual({ x: 4, y: 6 });
  } finally {
    await Promise.all(connected.map((bot) => bot.close()));
    await server.stop();
  }
});
