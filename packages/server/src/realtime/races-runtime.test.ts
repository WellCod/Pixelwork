import { frameOf, type Dir } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, loginGuest, startTestServer, type TestServer } from '../test/harness.ts';

let server: TestServer;
const cabinets = ['arcade@3,2', 'arcade@8,2'] as const;
const tile = frameOf('furniture-2x2', 'arcade');
beforeAll(async () => {
  server = await startTestServer({ media: new FakeMedia(), map: buildTestMap({
    width: 13, height: 8,
    furniture: [3, 8].map((x) => ({ x, y: 3, w: 2, h: 2, tile, tileset: 'furniture-2x2' })),
  }) });
});
afterAll(async () => { await server.stop(); });

it('reserva uma máquina por jogador e compartilha a corrida entre as máquinas do par', async () => {
  const active: Bot[] = [];
  const enter = async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    active.push(bot);
    await bot.next('welcome');
    return { bot, id: guest.id };
  };
  const approach = (bot: Bot, cabinetX: number) => bot.walk(server.clock, [
    'down', 'down', 'down', ...Array<Dir>(cabinetX - 1).fill('right'),
  ]);

  try {
    const left = await enter();
    const right = await enter();
    left.bot.send({ t: 'race.join', cabinet: cabinets[0] });
    expect((await left.bot.next('error')).code).toBe('race_not_at_arcade');
    await approach(left.bot, 3);
    left.bot.send({ t: 'race.join', cabinet: cabinets[0] });
    expect((await left.bot.next('race.state')).race?.phase).toBe('waiting');

    await approach(right.bot, 3);
    right.bot.send({ t: 'race.join', cabinet: cabinets[0] });
    expect((await right.bot.next('error')).code).toBe('race_busy');
    await right.bot.walk(server.clock, Array<Dir>(5).fill('right'));
    right.bot.send({ t: 'race.join', cabinet: cabinets[1] });
    const match = (await right.bot.next('race.state')).race;
    expect(match?.phase).toBe('countdown');
    expect(match?.drivers.map(({ id }) => id)).toEqual([left.id, right.id]);
    expect((await left.bot.next('race.state')).race).toEqual(match);

    left.bot.send({ t: 'race.steer', dir: 1 });
    left.bot.send({ t: 'race.pedal', pedal: 'accelerate' });
    await left.bot.flush();
    server.clock.advance(4_000);
    const moving = await right.bot.next('race.state', ({ race }) =>
      race?.phase === 'running' && race.drivers.some(({ distance }) => distance > 0));
    expect(moving.race?.drivers[0]).toMatchObject({ id: left.id, lane: 1 });
    expect(moving.race?.drivers[1]).toMatchObject({ id: right.id, speed: 0, distance: 0 });

    left.bot.send({ t: 'race.turbo' });
    await left.bot.flush();
    server.clock.advance(800);
    const boosted = (await right.bot.next('race.state', ({ race }) =>
      Boolean(race?.drivers.some(({ turboActive, speed }) => turboActive && speed > 110)))).race?.drivers[0];
    expect(boosted).toMatchObject({ id: left.id, turboActive: true });
    left.bot.send({ t: 'race.pedal', pedal: 'brake' });
    await left.bot.flush();
    server.clock.advance(1_000);
    const stopped = (await right.bot.next('race.state', ({ race }) =>
      Boolean(race?.drivers.some(({ id, speed, turboActive, turboReadyInMs }) =>
        id === left.id && speed === 0 && !turboActive && turboReadyInMs > 0)))).race?.drivers[0];
    expect(stopped?.turboReadyInMs).toBeGreaterThan(0);
    left.bot.send({ t: 'race.pedal', pedal: 'coast' });
    left.bot.send({ t: 'race.turbo' });
    await left.bot.flush();
    server.clock.advance(100);
    expect(await right.bot.next('race.state', ({ race }) => Boolean(race?.drivers[0] &&
      race.drivers[0].turboReadyInMs > 0 && race.drivers[0].turboReadyInMs < (stopped?.turboReadyInMs ?? 0))))
      .toMatchObject({ race: { drivers: [{ id: left.id, turboActive: false, speed: 0 }, expect.any(Object)] } });
    right.bot.send({ t: 'race.leave' });
    expect((await right.bot.next('race.state', ({ race }) => race === null)).race).toBeNull();
    expect((await left.bot.next('race.state', ({ race }) => race?.phase === 'finished')).race)
      .toMatchObject({ phase: 'finished', winner: left.id, opponentLeft: true });
    left.bot.send({ t: 'race.restart' });
    await left.bot.next('race.state', ({ race }) => race?.phase === 'waiting');
    left.bot.send({ t: 'race.solo' });
    await left.bot.next('race.state', ({ race }) => race?.solo === true);
    left.bot.send({ t: 'race.pedal', pedal: 'accelerate' });
    await left.bot.flush();
    server.clock.advance(35_000);
    expect((await left.bot.next('race.state', ({ race }) => race?.phase === 'finished')).race)
      .toMatchObject({ solo: true, winner: left.id, opponentLeft: false });
  } finally {
    await Promise.all(active.map((bot) => bot.close()));
  }
});
