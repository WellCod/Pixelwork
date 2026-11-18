import { CLOSE_REMOVED, RECONNECT_GRACE_MS } from '@pixelwork/shared';
import { deskAssignments, spaces, users } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, cleanupExpiredGuests, nextDemoReset, resetDemo, scheduleJobs, type JobDeps } from './jobs.ts';
import { loadTemplate } from './demo.ts';
import { Bot, api, loginGuest, startTestServer, until, type TestServer } from './test/harness.ts';

const silent = { info: () => undefined, error: () => undefined };

describe('jobs da demo', () => {
  let server: TestServer;
  let deps: JobDeps;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer();
    deps = {
      db: server.db,
      clock: server.clock,
      scheduler: server.clock,
      gateway: server.app.realtime,
      demoSpaceSlug: 'demo',
      log: silent,
    };
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  it('convidado expirado é removido, sai do mapa e libera a mesa', async () => {
    const watcher = await loginGuest(server);
    const expiring = await loginGuest(server);
    const watcherBot = await Bot.connect(server, watcher);
    const expiringBot = await Bot.connect(server, expiring);
    bots.push(watcherBot);
    await watcherBot.next('welcome');
    await expiringBot.next('welcome');
    await expiringBot.walk(server.clock, ['down', 'right', 'right']);
    expect((await api(server, expiring, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
    await watcherBot.next('desk.updated', (m) => m.desk.userId === expiring.id);

    // Antes de vencer, nada acontece.
    expect(await cleanupExpiredGuests(deps)).toEqual([]);

    // Só o segundo convidado vence; o observador continua válido.
    await server.db
      .update(users)
      .set({ guestExpiresAt: new Date(server.clock.now() - 1) })
      .where(eq(users.id, expiring.id));
    expect(await cleanupExpiredGuests(deps)).toEqual([expiring.id]);

    expect(await expiringBot.closed).toBe(CLOSE_REMOVED);
    expect((await watcherBot.next('desk.updated', (m) => m.desk.deskKey === 'mesa-1' && m.desk.userId === null)).desk.userId).toBeNull();
    expect(await server.db.select().from(users).where(eq(users.id, expiring.id))).toEqual([]);
    expect(await server.db.select().from(deskAssignments).where(eq(deskAssignments.userId, expiring.id))).toEqual([]);
  });

  it('reset restaura o mapa da demo a partir do template, limpa as mesas e avisa quem está online', async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    await bot.next('welcome');
    await bot.walk(server.clock, ['down', 'right', 'right']);
    expect((await api(server, guest, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
    const before = (await server.db.select({ v: spaces.mapVersion }).from(spaces).where(eq(spaces.id, server.spaceId)))[0]?.v ?? 0;

    const version = await resetDemo(deps);
    expect(version).toBe(before + 1);
    expect((await bot.next('map.updated')).version).toBe(before + 1);
    expect((await bot.next('desk.updated', (m) => m.desk.deskKey === 'mesa-1' && m.desk.userId === null)).desk.decor).toBeNull();

    const row = (await server.db.select({ map: spaces.map }).from(spaces).where(eq(spaces.id, server.spaceId)))[0];
    expect(row?.map).toEqual(loadTemplate('small-office'));
    expect(await server.db.select().from(deskAssignments).where(eq(deskAssignments.spaceId, server.spaceId))).toEqual([]);
  });

  it('agendamento: reset às 03:00 UTC, com o relógio manual', async () => {
    const version = async () =>
      (await server.db.select({ v: spaces.mapVersion }).from(spaces).where(eq(spaces.id, server.spaceId)))[0]?.v ?? 0;
    const before = await version();
    const jobs = scheduleJobs(deps);
    try {
      const untilReset = nextDemoReset(server.clock.now()) - server.clock.now();
      server.clock.advance(untilReset - 1);
      expect(await version()).toBe(before);
      server.clock.advance(1);
      // O job roda assíncrono depois do disparo: espera o banco refletir.
      for (let i = 0; i < 100 && (await version()) === before; i++) await new Promise((r) => setImmediate(r));
      expect(await version()).toBe(before + 1);
    } finally {
      jobs.stop();
    }
  });

  it('nextDemoReset devolve sempre o próximo 03:00 UTC', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(nextDemoReset(at('2026-11-18T02:59:00Z'))).toBe(at('2026-11-18T03:00:00Z'));
    expect(nextDemoReset(at('2026-11-18T03:00:00Z'))).toBe(at('2026-11-19T03:00:00Z'));
    expect(nextDemoReset(at('2026-11-18T22:00:00Z'))).toBe(at('2026-11-19T03:00:00Z'));
    expect(HOUR_MS * 24).toBe(DAY_MS);
  });
});
