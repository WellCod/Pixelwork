import { CREDITS, RECONNECT_GRACE_MS, TILESET_IDS, compileMap, type Dir, type ServerMsg } from '@pixelwork/shared';
import { deskAssignments, orgs, spaceMembers, spaces } from '@pixelwork/shared/schema';
import { buildTestMap, type TestMapOptions } from '@pixelwork/shared/testing';
import { and, eq, sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '../ids.ts';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, api, loginGuest, startTestServer, until, type Guest, type TestServer } from '../test/harness.ts';

/** 12x10 com borda, mesas com cadeira em (3,2), (5,2) e (7,2), zona aberta "ilha" e sala "sala". */
const base: TestMapOptions = {
  width: 12,
  height: 10,
  spawns: [[1, 1]],
  desks: [
    { key: 'mesa-1', x: 3, y: 1, orientation: 'down' },
    { key: 'mesa-2', x: 5, y: 1, orientation: 'down' },
    { key: 'mesa-3', x: 7, y: 1, orientation: 'down' },
  ],
  zones: [
    { key: 'ilha', type: 'open', x: 1, y: 6, w: 2, h: 2 },
    { key: 'sala', type: 'meeting', x: 8, y: 4, w: 3, h: 3 },
  ],
};
const MAP_V1 = buildTestMap(base);

describe('mapas: upload, troca ao vivo e export', () => {
  let server: TestServer;
  let media: FakeMedia;
  const bots: Bot[] = [];
  let admin: Guest;

  const space = (path: string) => `/spaces/${server.spaceId}${path}`;
  const version = async () =>
    (await server.db.select({ v: spaces.mapVersion }).from(spaces).where(eq(spaces.id, server.spaceId)))[0]?.v ?? 0;

  beforeAll(async () => {
    media = new FakeMedia();
    server = await startTestServer({ map: MAP_V1, media });
  });

  beforeEach(async () => {
    // Cada teste parte do mapa base, sem mesas atribuídas, e com um admin novo.
    await server.db.delete(deskAssignments);
    const current = await version();
    admin = await loginGuest(server);
    await server.db
      .update(spaceMembers)
      .set({ role: 'admin' })
      .where(and(eq(spaceMembers.spaceId, server.spaceId), eq(spaceMembers.userId, admin.id)));
    const reset = await api(server, admin, 'PUT', space('/map'), { map: MAP_V1, baseVersion: current });
    expect(reset.status).toBe(200);
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  async function online(guest?: Guest) {
    const resolvedGuest = guest ?? (await loginGuest(server));
    const bot = await Bot.connect(server, resolvedGuest);
    bots.push(bot);
    await bot.next('welcome');
    return { guest: resolvedGuest, bot };
  }

  async function claim(player: { guest: Guest; bot: Bot }, path: Dir[], deskKey: string) {
    await player.bot.walk(server.clock, path);
    expect((await api(server, player.guest, 'POST', space(`/desks/${deskKey}/claim`))).status).toBe(201);
  }

  it('validate devolve os erros do mapa e as mesas atribuídas que sumiriam', async () => {
    const player = await online();
    await claim(player, ['down', 'right', 'right', 'right', 'right', 'right', 'right'], 'mesa-3');
    const withoutDesk3 = buildTestMap({ ...base, desks: base.desks?.slice(0, 2) ?? [] });

    const validation = await api(server, admin, 'POST', space('/map/validate'), { map: withoutDesk3 });
    expect(validation.json).toEqual({ errors: [], orphanDesks: ['mesa-3'] });

    const broken = { ...withoutDesk3, orientation: 'isometric' };
    expect((await api(server, admin, 'POST', space('/map/validate'), { map: broken })).json).toEqual({
      errors: [{ code: 'not_orthogonal' }],
      orphanDesks: [],
    });
    expect((await api(server, player.guest, 'POST', space('/map/validate'), { map: withoutDesk3 })).status).toBe(403);
  });

  it('membro da demo pode abrir o editor sem poder salvar no mapa compartilhado', async () => {
    const guest = await loginGuest(server);
    const before = await version();
    expect((await api(server, guest, 'GET', space(''))).json).toMatchObject({ role: 'member', canEditMap: true });
    expect((await api(server, guest, 'PUT', space('/map'), { map: MAP_V1, baseVersion: before })).status).toBe(403);
    expect(await version()).toBe(before);
    expect((await api(server, guest, 'GET', space('/replay'))).status).toBe(403);
    expect((await api(server, guest, 'GET', space('/map/export'))).status).toBe(403);
  });

  it('membro de outro coworking com slug demo não pode editar o mapa', async () => {
    const guest = await loginGuest(server);
    const orgId = uuidv7();
    const spaceId = uuidv7();
    await server.db.insert(orgs).values({ id: orgId, slug: 'outra-empresa', name: 'Outra empresa' });
    await server.db.insert(spaces).values({ id: spaceId, orgId, name: 'Outra demo', slug: 'demo', map: MAP_V1 });
    await server.db.insert(spaceMembers).values({ spaceId, userId: guest.id, role: 'member' });
    const root = '/spaces/' + spaceId;
    expect((await api(server, guest, 'GET', root)).json).toMatchObject({ role: 'member', canEditMap: false });
    expect((await api(server, guest, 'POST', root + '/map/validate', { map: MAP_V1 })).status).toBe(403);
    expect((await api(server, guest, 'PUT', root + '/map', { map: MAP_V1, baseVersion: 1 })).status).toBe(403);
  });

  it('409 com baseVersion antiga', async () => {
    const current = await version();
    expect((await api(server, admin, 'PUT', space('/map'), { map: MAP_V1, baseVersion: current })).status).toBe(200);
    const stale = await api(server, admin, 'PUT', space('/map'), { map: MAP_V1, baseVersion: current });
    expect(stale).toEqual({ status: 409, json: { error: 'stale_map', version: current + 1 } });
  });

  it('arquiva as versões e permite republicar uma versão antiga como nova', async () => {
    const before = await version();
    expect((await api(server, admin, 'PUT', space('/map'), { map: MAP_V1, baseVersion: before })).status).toBe(200);
    const history = await api(server, admin, 'GET', space('/map/history'));
    const entries = history.json as { version: number; author: string | null; createdAt: string | null }[];
    const latest = entries.find((entry) => entry.version === before + 1);
    expect(typeof latest?.author).toBe('string');
    expect(typeof latest?.createdAt).toBe('string');
    expect(entries.some((entry) => entry.version === before)).toBe(true);
    const older = await api(server, admin, 'GET', space(`/map/history/${before}`));
    expect(older.status).toBe(200);
    const { map } = older.json as { map: unknown };
    expect((await api(server, admin, 'PUT', space('/map'), { map, baseVersion: before + 1 })).json)
      .toMatchObject({ version: before + 2 });
    expect((await api(server, await loginGuest(server), 'GET', space('/map/history'))).status).toBe(403);
  });

  it('mapa inválido é recusado sem mudar a versão', async () => {
    const before = await version();
    const result = await api(server, admin, 'PUT', space('/map'), { map: { ...MAP_V1, infinite: true }, baseVersion: before });
    expect(result).toEqual({ status: 422, json: { error: 'invalid_map', errors: [{ code: 'infinite' }] } });
    expect(await version()).toBe(before);
  });

  it('mesas órfãs saem na mesma transação; falha no meio não deixa estado parcial', async () => {
    const player = await online();
    await claim(player, ['down', 'right', 'right', 'right', 'right', 'right', 'right'], 'mesa-3');
    const withoutDesk3 = buildTestMap({ ...base, desks: base.desks?.slice(0, 2) ?? [] });
    const before = await version();

    // Gatilho que derruba a remoção das atribuições: a troca de mapa tem que ser desfeita junto.
    await server.db.execute(sql`create function falha_forcada() returns trigger as $$
      begin raise exception 'falha forçada'; end $$ language plpgsql`);
    await server.db.execute(
      sql`create trigger falha_forcada before delete on desk_assignments for each row execute function falha_forcada()`,
    );
    try {
      const failed = await api(server, admin, 'PUT', space('/map'), { map: withoutDesk3, baseVersion: before });
      expect(failed.status).toBe(500);
      expect(await version()).toBe(before);
      const still = await server.db.select().from(deskAssignments).where(eq(deskAssignments.deskKey, 'mesa-3'));
      expect(still).toHaveLength(1);
    } finally {
      await server.db.execute(sql`drop trigger falha_forcada on desk_assignments`);
      await server.db.execute(sql`drop function falha_forcada()`);
    }

    const saved = await api(server, admin, 'PUT', space('/map'), { map: withoutDesk3, baseVersion: before });
    expect(saved).toEqual({ status: 200, json: { version: before + 1, orphanDesks: ['mesa-3'] } });
    expect(await server.db.select().from(deskAssignments).where(eq(deskAssignments.deskKey, 'mesa-3'))).toEqual([]);
  });

  it('quem ficou em tile que virou parede vai para o mais próximo na mesma zona, e todos recebem map.updated', async () => {
    const mover = await online();
    const watcher = await online();
    await mover.bot.walk(server.clock, ['down', 'down']);
    server.clock.advance(100);
    await watcher.bot.flush();
    watcher.bot.inbox.splice(0);
    const before = await version();

    const walled = buildTestMap({ ...base, walls: [[1, 3]] });
    expect((await api(server, admin, 'PUT', space('/map'), { map: walled, baseVersion: before })).status).toBe(200);
    expect(await watcher.bot.next('map.updated')).toEqual({ t: 'map.updated', version: before + 1 });

    server.clock.advance(100);
    const tick = await watcher.bot.next('tick', (message) => message.moves.some(([id]) => id === mover.guest.id));
    const move = tick.moves.find(([id]) => id === mover.guest.id);
    const compiled = compileMap(walled);
    if (!compiled.ok) throw new Error('mapa de teste inválido');
    const [, x, y] = move ?? [];
    expect(Math.abs((x ?? 0) - 1) + Math.abs((y ?? 0) - 3)).toBe(1);
  });

  it('sem tile livre na zona, vai para o spawn', async () => {
    const islander = await online();
    await islander.bot.walk(server.clock, ['down', 'down', 'down', 'down', 'down']);
    server.clock.advance(100);
    await islander.bot.flush();
    islander.bot.inbox.splice(0);
    const walled = buildTestMap({ ...base, walls: [[1, 6], [2, 6], [1, 7], [2, 7]] });
    await api(server, admin, 'PUT', space('/map'), { map: walled, baseVersion: await version() });
    await islander.bot.next('map.updated');
    server.clock.advance(100);
    const tick = await islander.bot.next('tick', (message) => message.moves.some(([id]) => id === islander.guest.id));
    expect(tick.moves.find(([id]) => id === islander.guest.id)?.slice(1, 3)).toEqual([1, 1]);
  });

  it('zona removida com sala trancada: tranca limpa e ocupantes devolvidos à sala space:', async () => {
    const inside = await online();
    // Até (9,5), dentro da sala.
    await inside.bot.walk(server.clock, ['down', 'down', 'down', 'down', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right']);
    await inside.bot.next('media.join', (message) => message.room === `zone:${server.spaceId}:sala`);
    inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
    await inside.bot.next('zone.state', (message) => message.zone.locked);

    const noRoom = buildTestMap({ ...base, zones: base.zones?.filter((zone) => zone.key !== 'sala') ?? [] });
    await api(server, admin, 'PUT', space('/map'), { map: noRoom, baseVersion: await version() });
    const join = await inside.bot.next('media.join', (message) => message.room === `space:${server.spaceId}`);
    expect(join.room).toBe(`space:${server.spaceId}`);
    expect(media.deletedRooms).toContain(`zone:${server.spaceId}:sala`);
    expect(media.removed).toContainEqual({ room: `zone:${server.spaceId}:sala`, identity: inside.guest.id });

    // Quem chega depois não vê a sala no welcome.
    const late = await online();
    const welcomeZones = late.bot.inbox.filter((message): message is Extract<ServerMsg, { t: 'zone.state' }> => message.t === 'zone.state');
    expect(welcomeZones.every((message) => message.zone.zoneKey !== 'sala')).toBe(true);
  });

  it('export: zip com map.json, exatamente os tilesets referenciados e os créditos', async () => {
    const response = await fetch(`${server.baseUrl}${space('/map/export')}`, { headers: { cookie: admin.cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const tilesets = [...TILESET_IDS];
    expect(Object.keys(files).sort()).toEqual(
      ['CREDITS.txt', 'map.json', ...tilesets.flatMap((tileset) => [`${tileset}.png`, `${tileset}.tsj`])].sort(),
    );
    const exported: unknown = JSON.parse(strFromU8(files['map.json'] ?? new Uint8Array()));
    expect(compileMap(exported).ok).toBe(true);
    const credits = strFromU8(files['CREDITS.txt'] ?? new Uint8Array());
    for (const id of tilesets) {
      const entry = CREDITS.find((credit) => credit.kind === 'tileset' && credit.id === id);
      expect(credits).toContain(`${id}.png: ${entry?.author ?? ''}, licença ${entry?.license ?? ''}`);
    }

    const member = await loginGuest(server);
    const denied = await fetch(`${server.baseUrl}${space('/map/export')}`, { headers: { cookie: member.cookie } });
    expect(denied.status).toBe(403);
  });

  it('export de mapa que usa só parte dos tilesets leva só esses', async () => {
    const partial = buildTestMap({ ...base });
    partial.tilesets = (partial.tilesets as { source: string }[])
      .filter((tileset) => !tileset.source.startsWith('desk-decor'));
    const saved = await api(server, admin, 'PUT', space('/map'), { map: partial, baseVersion: await version() });
    expect(saved.status).toBe(200);
    const response = await fetch(`${server.baseUrl}${space('/map/export')}`, { headers: { cookie: admin.cookie } });
    const files = Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())));
    expect(files.some((fileName) => fileName.startsWith('desk-decor'))).toBe(false);
    expect(files).toContain('furniture.png');
  });
});
