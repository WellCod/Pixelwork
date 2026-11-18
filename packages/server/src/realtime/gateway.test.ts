import { CLOSE_POLICY, CLOSE_SESSION_REPLACED, MIN_STEP_INTERVAL_MS, RECONNECT_GRACE_MS, TICK_MS } from '@pixelwork/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Bot, loginGuest, startTestServer, until, type TestServer } from '../test/harness.ts';

describe('tempo real', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close()));
    // Esgota a tolerância de reconexão para o próximo teste começar vazio.
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  async function connect(guest?: Awaited<ReturnType<typeof loginGuest>>) {
    const g = guest ?? (await loginGuest(server));
    const bot = await Bot.connect(server, g);
    bots.push(bot);
    const welcome = await bot.next('welcome');
    return { bot, guest: g, welcome };
  }

  it('welcome, entrada e saída depois da tolerância de reconexão', async () => {
    const a = await connect();
    expect(a.welcome.selfId).toBe(a.guest.id);
    expect(a.welcome.players).toEqual([expect.objectContaining({ id: a.guest.id, x: 1, y: 1 })]);

    const b = await connect();
    const join = await a.bot.next('player.join');
    expect(join.player.id).toBe(b.guest.id);
    expect(b.welcome.players.map((p) => p.id).sort()).toEqual([a.guest.id, b.guest.id].sort());

    bots.splice(bots.indexOf(b.bot), 1);
    await b.bot.close();
    await until(() => server.app.realtime.connections() === 1);

    server.clock.advance(RECONNECT_GRACE_MS - 1);
    await a.bot.flush();
    expect(a.bot.inbox.some((m) => m.t === 'player.leave')).toBe(false);

    server.clock.advance(1);
    const leave = await a.bot.next('player.leave');
    expect(leave.id).toBe(b.guest.id);
  });

  it('volta dentro da tolerância sem player.leave e na mesma posição', async () => {
    const a = await connect();
    const b = await connect();
    await a.bot.next('player.join');

    b.bot.send({ t: 'move', seq: 1, dir: 'right' });
    await b.bot.flush();
    bots.splice(bots.indexOf(b.bot), 1);
    await b.bot.close();
    await until(() => server.app.realtime.connections() === 1);
    server.clock.advance(RECONNECT_GRACE_MS - 1);

    const again = await connect(b.guest);
    expect(again.welcome.players.find((p) => p.id === b.guest.id)).toMatchObject({ x: 2, y: 1 });
    server.clock.advance(RECONNECT_GRACE_MS);
    await a.bot.flush();
    expect(a.bot.inbox.some((m) => m.t === 'player.leave')).toBe(false);
  });

  it('movimento aparece para o outro no tick seguinte', async () => {
    const a = await connect();
    const b = await connect();
    a.bot.send({ t: 'move', seq: 1, dir: 'right' });
    await a.bot.flush();
    server.clock.advance(TICK_MS);

    const tick = await b.bot.next('tick', (m) => m.moves.length > 0);
    expect(tick.moves).toEqual([[a.guest.id, 2, 1, 'right']]);
    expect(tick.ack).toBe(0);
    const own = await a.bot.next('tick', (m) => m.moves.length > 0);
    expect(own.ack).toBe(1);
  });

  it('passo contra a parede devolve a posição autoritativa', async () => {
    const a = await connect();
    a.bot.send({ t: 'move', seq: 1, dir: 'up' });
    await a.bot.flush();
    server.clock.advance(TICK_MS);
    const tick = await a.bot.next('tick');
    expect(tick).toEqual({ t: 'tick', ack: 1, moves: [[a.guest.id, 1, 1, 'up']] });
  });

  it('passo antes do intervalo mínimo é ignorado, mas confirmado no ack', async () => {
    const a = await connect();
    a.bot.send({ t: 'move', seq: 1, dir: 'right' });
    server.clock.advance(MIN_STEP_INTERVAL_MS - 1);
    a.bot.send({ t: 'move', seq: 2, dir: 'right' });
    await a.bot.flush();
    server.clock.advance(TICK_MS);
    const tick = await a.bot.next('tick');
    expect(tick.ack).toBe(2);
    expect(tick.moves).toEqual([[a.guest.id, 2, 1, 'right']]);
  });

  it('recusa Origin inválido no upgrade', async () => {
    const guest = await loginGuest(server);
    await expect(Bot.connect(server, guest, 'http://evil.test')).rejects.toThrow('HTTP 403');
  });

  it('recusa upgrade sem sessão', async () => {
    await expect(Bot.connect(server, { id: '', cookie: 'sid=nada' })).rejects.toThrow('HTTP 401');
  });

  it('segunda conexão do mesmo usuário substitui a primeira', async () => {
    const first = await connect();
    const second = await connect(first.guest);
    await first.bot.next('session.replaced');
    expect(await first.bot.closed).toBe(CLOSE_SESSION_REPLACED);
    bots.splice(bots.indexOf(first.bot), 1);
    expect(second.welcome.selfId).toBe(first.guest.id);
  });

  it('fecha a conexão depois de mais de 10 mensagens inválidas em 10 segundos', async () => {
    const a = await connect();
    for (let i = 0; i < 11; i++) a.bot.send('{"t":"voar"}');
    expect(await a.bot.closed).toBe(CLOSE_POLICY);
    bots.splice(bots.indexOf(a.bot), 1);
  });

  it('fecha a conexão acima de 50 mensagens por segundo', async () => {
    const a = await connect();
    for (let i = 1; i <= 51; i++) a.bot.send({ t: 'move', seq: i, dir: 'left' });
    expect(await a.bot.closed).toBe(CLOSE_POLICY);
    bots.splice(bots.indexOf(a.bot), 1);
  });
});
