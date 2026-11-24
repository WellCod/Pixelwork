import { CLOSE_REMOVED, RECONNECT_GRACE_MS, compileMap, findPath } from '@pixelwork/shared';
import { deskAssignments, sessions, spaces, users } from '@pixelwork/shared/schema';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DAY_MS, HOUR_MS, cleanupExpiredGuests, cleanupExpiredSessions, nextDemoReset, resetDemo, scheduleJobs, type JobDeps } from './jobs.ts';
import { loadDemoTemplate, loadTemplate } from './demo.ts';
import { Bot, api, loginGuest, startTestServer, until, type TestServer } from './test/harness.ts';

/** Logger mudo para os jobs não sujarem a saída dos testes. */
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
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
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
    await watcherBot.next('desk.updated', (message) => message.desk.userId === expiring.id);

    // Antes de vencer, nada acontece.
    expect(await cleanupExpiredGuests(deps)).toEqual([]);

    // Só o segundo convidado vence; o observador continua válido.
    await server.db
      .update(users)
      .set({ guestExpiresAt: new Date(server.clock.now() - 1) })
      .where(eq(users.id, expiring.id));
    expect(await cleanupExpiredGuests(deps)).toEqual([expiring.id]);

    expect(await expiringBot.closed).toBe(CLOSE_REMOVED);
    expect((await watcherBot.next('desk.updated', (message) => message.desk.deskKey === 'mesa-1' && message.desk.userId === null)).desk.userId).toBeNull();
    expect(await server.db.select().from(users).where(eq(users.id, expiring.id))).toEqual([]);
    expect(await server.db.select().from(deskAssignments).where(eq(deskAssignments.userId, expiring.id))).toEqual([]);
  });

  it('sessão vencida é apagada; a válida fica', async () => {
    const stale = await loginGuest(server);
    const fresh = await loginGuest(server);
    await server.db
      .update(sessions)
      .set({ expiresAt: new Date(server.clock.now() - 1) })
      .where(eq(sessions.userId, stale.id));
    expect(await cleanupExpiredSessions(deps)).toBeGreaterThanOrEqual(1);
    const remainingSessions = await server.db.select({ userId: sessions.userId }).from(sessions);
    expect(remainingSessions.map((row) => row.userId)).toContain(fresh.id);
    expect(remainingSessions.map((row) => row.userId)).not.toContain(stale.id);
  });

  it('reset restaura o mapa da demo a partir do template, limpa as mesas e avisa quem está online', async () => {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    await bot.next('welcome');
    await bot.walk(server.clock, ['down', 'right', 'right']);
    expect((await api(server, guest, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
    const before = (await server.db.select({ mapVersion: spaces.mapVersion }).from(spaces).where(eq(spaces.id, server.spaceId)))[0]?.mapVersion ?? 0;

    const version = await resetDemo(deps);
    expect(version).toBe(before + 1);
    expect((await bot.next('map.updated')).version).toBe(before + 1);
    expect((await bot.next('desk.updated', (message) => message.desk.deskKey === 'mesa-1' && message.desk.userId === null)).desk.decor).toBeNull();

    const row = (await server.db.select({ map: spaces.map }).from(spaces).where(eq(spaces.id, server.spaceId)))[0];
    expect(row?.map).toEqual(loadDemoTemplate());
    const map = compileMap(row?.map);
    if (!map.ok) throw new Error('mapa restaurado inválido');
    const decorated = map.map.desks.filter(({ defaultDecor }) => defaultDecor);
    expect(decorated.map(({ key, defaultDecor }) => [key, defaultDecor?.slots.right])).toEqual([
      ['mesa-1', 'christmas-candy-cane'], ['mesa-2', 'grinch-max'], ['mesa-3', 'grinch-snow-globe'],
      ['mesa-4', 'halloween-skull'], ['mesa-5', 'halloween-potion'], ['mesa-6', 'halloween-pumpkin-lamp'],
    ]);
    expect(await server.db.select().from(deskAssignments).where(eq(deskAssignments.spaceId, server.spaceId))).toEqual([]);

    const middle = decorated.find(({ key }) => key === 'mesa-2');
    const position = server.app.realtime.runtime(server.spaceId)?.positionOf(guest.id);
    if (!middle || !position) throw new Error('mesa do Max ou visitante ausente');
    const path = findPath(map.map, position, { x: middle.chairX, y: middle.chairY });
    if (!path) throw new Error('mesa do Max inacessível');
    await bot.walk(server.clock, path);
    const claim = await api(server, guest, 'POST', `/spaces/${server.spaceId}/desks/mesa-2/claim`);
    expect(claim.status).toBe(201);
    expect(claim.json).toMatchObject({ decor: middle.defaultDecor });
    expect((await api(server, guest, 'DELETE', `/spaces/${server.spaceId}/desks/mesa-2`)).status).toBe(204);
  });

  it('usa a decoração sazonal apenas no modelo da demo', () => {
    const base = compileMap(loadTemplate('small-office'));
    expect(base.ok && base.map.desks.some(({ defaultDecor }) => defaultDecor)).toBe(false);
  });

  it('agendamento: reset às 03:00 UTC, com o relógio manual', async () => {
    const version = async () =>
      (await server.db.select({ mapVersion: spaces.mapVersion }).from(spaces).where(eq(spaces.id, server.spaceId)))[0]?.mapVersion ?? 0;
    const before = await version();
    const jobs = scheduleJobs(deps);
    try {
      const untilReset = nextDemoReset(server.clock.now()) - server.clock.now();
      server.clock.advance(untilReset - 1);
      expect(await version()).toBe(before);
      server.clock.advance(1);
      // O job roda assíncrono depois do disparo: espera o banco refletir.
      for (let i = 0; i < 100 && (await version()) === before; i++) await new Promise((resolve) => setImmediate(resolve));
      expect(await version()).toBe(before + 1);
    } finally {
      jobs.stop();
    }
  });

  it('nextDemoReset devolve sempre o próximo 03:00 UTC', () => {
    const parseIso = (iso: string) => Date.parse(iso);
    expect(nextDemoReset(parseIso('2026-11-18T02:59:00Z'))).toBe(parseIso('2026-11-18T03:00:00Z'));
    expect(nextDemoReset(parseIso('2026-11-18T03:00:00Z'))).toBe(parseIso('2026-11-19T03:00:00Z'));
    expect(nextDemoReset(parseIso('2026-11-18T22:00:00Z'))).toBe(parseIso('2026-11-19T03:00:00Z'));
    expect(HOUR_MS * 24).toBe(DAY_MS);
  });
});
