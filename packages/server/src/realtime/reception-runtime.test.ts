import { PROXIMITY_EXIT_TILES, TILE_PX, type Dir } from '@pixelwork/shared';
import { receptionDailyUsage, spaces } from '@pixelwork/shared/schema';
import { buildTestMap } from '@pixelwork/shared/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, loginGuest, startTestServer, until, type TestServer } from '../test/harness.ts';
import { spaceRoom } from './media.ts';
import type { ReceptionVoice, ReceptionVoiceRequest } from './reception-runtime.ts';

function fixture() {
  const map = buildTestMap({ width: 20, height: 12, spawns: [[1, 1]],
    zones: [{ key: 'aurora', name: 'Aurora', type: 'meeting', x: 8, y: 3, w: 3, h: 3 }],
    desks: [{ key: 'mesa-3', x: 5, y: 5, orientation: 'down' }],
  });
  return { ...map, layers: [...(map.layers as unknown[]), {
    name: 'reception', type: 'objectgroup', objects: [{ point: true, x: 2.5 * TILE_PX, y: 1.5 * TILE_PX }],
  }] };
}

describe('atendimento local da recepção', () => {
  let server: TestServer;
  const starts: ReceptionVoiceRequest[] = [];
  const stops: string[] = [];
  const voice: ReceptionVoice = {
    ready: () => true,
    start: (request) => { starts.push(request); return Promise.resolve(); },
    stop: (id) => { stops.push(id); return Promise.resolve(); },
  };
  const media = new FakeMedia();
  beforeAll(async () => {
    server = await startTestServer({
      map: fixture(), media, receptionVoice: voice,
      receptionLimits: { sessions: 2, durationMs: 120_000, dailyMs: 120_000 },
    });
  });
  afterAll(async () => { await server.stop(); });

  it('exige consentimento, ocupa uma vaga e retira a identidade após sair do raio', async () => {
    const bots: Bot[] = [];
    try {
      await server.db.update(spaces).set({ receptionEnabled: true }).where(eq(spaces.id, server.spaceId));
      const one = await loginGuest(server);
      const two = await loginGuest(server);
      const first = await Bot.connect(server, one);
      bots.push(first);
      const visitor = await Bot.connect(server, two);
      bots.push(visitor);
      expect((await first.next('welcome')).reception?.status).toBe('available');
      const welcome = await visitor.next('welcome');
      await first.next('media.join');
      await visitor.next('media.join');

      first.send(JSON.stringify({ t: 'reception.start', consent: false }));
      first.send({ t: 'ping', id: 1 });
      await first.next('pong');
      expect(starts).toHaveLength(0);
      first.send({ t: 'reception.start', consent: true });
      const ready = await first.next('reception.session', (msg) => msg.state === 'active');
      if (ready.state !== 'active') throw new Error('a sessão não abriu');
      expect(media.tokens).toContainEqual({ identity: ready.identity, room: spaceRoom(server.spaceId), sources: ['microphone'] });
      const started = starts[0];
      if (!started) throw new Error('worker não recebeu lease');
      expect(started.visitorId).toBe(one.id);
      expect((await first.next('media.audience', ({ ids }) => ids.includes(ready.identity))).ids).toContain(ready.identity);
      await visitor.flush();
      expect(visitor.inbox.some((msg) => msg.t === 'media.audience' && msg.ids.includes(ready.identity))).toBe(false);
      expect(started.tool({ name: 'explain_locked_room', query: 'Aurora' })).toMatchObject({ rooms: [{ name: 'Aurora', locked: false }] });
      expect(started.tool({ name: 'list_online_people', spaceId: 'outside' })).toEqual({ error: 'invalid_tool' });
      started.tool({ name: 'locate_place', query: 'Aurora' });
      expect((await first.next('reception.destination')).destination).toEqual({ kind: 'room', key: 'aurora', label: 'Aurora' });
      started.tool({ name: 'locate_place', query: '3' });
      expect((await first.next('reception.destination')).destination).toEqual({ kind: 'desk', key: 'mesa-3', label: 'mesa-3' });
      const name = welcome.players.find(({ id }) => id === two.id)?.name;
      expect(name).toBeTruthy();
      started.tool({ name: 'list_online_people', query: name });
      expect((await first.next('reception.destination')).destination).toEqual({ kind: 'person', id: two.id, label: name });
      started.tool({ name: 'locate_place', query: name });
      expect((await first.next('reception.destination')).destination).toEqual({ kind: 'person', id: two.id, label: name });
      await visitor.walk(server.clock, [...Array<Dir>(7).fill('right'), 'down', 'down']);
      started.tool({ name: 'list_online_people', query: name });
      expect((await first.next('reception.destination')).destination).toBeNull();
      await visitor.flush();
      expect(visitor.inbox.some(({ t }) => t === 'reception.destination')).toBe(false);
      visitor.send({ t: 'reception.start', consent: true });
      expect(await visitor.next('reception.session')).toMatchObject({ state: 'ended', reason: 'busy' });
      expect(starts).toHaveLength(1);

      await first.walk(server.clock, Array.from({ length: PROXIMITY_EXIT_TILES + 2 }, (): Dir => 'right'));
      expect(await first.next('reception.session', (msg) => msg.state === 'ended')).toMatchObject({ state: 'ended', reason: 'left' });
      await until(() => media.removed.some((entry) => entry.identity === ready.identity));
      expect(stops).toEqual([started.id]);
      expect(started.tool({ name: 'list_online_people' })).toEqual({ error: 'invalid_lease' });
    } finally {
      await Promise.all(bots.map((bot) => bot.close()));
    }
  });

  it('aplica a cota de voz por coworking e mantém perguntas e rotas por texto', async () => {
    await server.db.update(spaces).set({ receptionEnabled: true }).where(eq(spaces.id, server.spaceId));
    await server.db.insert(receptionDailyUsage).values({
      spaceId: server.spaceId, day: new Date(server.clock.now()).toISOString().slice(0, 10), reservedMs: 120_000,
    }).onConflictDoNothing();
    const previousStarts = starts.length;
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    try {
      await bot.next('media.join');
      bot.send({ t: 'reception.ask', text: 'Onde fica a Sala Aurora?' });
      expect((await bot.next('reception.answer')).text).toContain('Aurora');
      expect((await bot.next('reception.destination', (msg) => msg.destination !== null)).destination)
        .toEqual({ kind: 'room', key: 'aurora', label: 'Aurora' });
      bot.send({ t: 'reception.start', consent: true });
      expect(await bot.next('reception.session', (msg) => msg.state === 'ended')).toMatchObject({ reason: 'quota' });
      expect(starts).toHaveLength(previousStarts);
    } finally {
      await bot.close();
    }
  });
});
