import { PROXIMITY_EXIT_TILES, TILE_PX, type Dir } from '@pixelwork/shared';
import { spaces } from '@pixelwork/shared/schema';
import { buildTestMap } from '@pixelwork/shared/testing';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, loginGuest, startTestServer, until } from '../test/harness.ts';
import { spaceRoom } from './media.ts';
import type { ReceptionVoice, ReceptionVoiceRequest } from './reception-runtime.ts';

function fixture() {
  const map = buildTestMap({ width: 20, height: 12, spawns: [[1, 1]], zones: [{ key: 'aurora', name: 'Aurora', type: 'meeting', x: 8, y: 3, w: 3, h: 3 }] });
  return { ...map, layers: [...(map.layers as unknown[]), {
    name: 'reception', type: 'objectgroup', objects: [{ point: true, x: 2.5 * TILE_PX, y: 1.5 * TILE_PX }],
  }] };
}

describe('atendimento local da recepção', () => {
  it('exige consentimento, ocupa uma vaga e retira a identidade após sair do raio', async () => {
    const starts: ReceptionVoiceRequest[] = [];
    const stops: string[] = [];
    const voice: ReceptionVoice = {
      ready: () => true,
      start: (request) => { starts.push(request); return Promise.resolve(); },
      stop: (id) => { stops.push(id); return Promise.resolve(); },
    };
    const media = new FakeMedia();
    const server = await startTestServer({ map: fixture(), media, receptionVoice: voice });
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
      await visitor.next('welcome');
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
      expect(started.tool({ name: 'explain_locked_room', query: 'Aurora' })).toMatchObject({ rooms: [{ name: 'Aurora', locked: false }] });
      expect(started.tool({ name: 'list_online_people', spaceId: 'outside' })).toEqual({ error: 'invalid_tool' });
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
      await server.stop();
    }
  });
});
