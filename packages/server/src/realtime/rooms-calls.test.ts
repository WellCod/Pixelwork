import {
  CALL_RING_TIMEOUT_MS,
  TICK_MS,
  compileMap,
  KNOCK_TIMEOUT_MS,
  RECONNECT_GRACE_MS,
  type Dir,
  type ServerMsg,
} from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, api, loginGuest, startTestServer, until, type Guest, type TestServer } from '../test/harness.ts';

/**
 * 12x10 com borda. Sala de reunião "sala" em x 6..9, y 1..4, fechada por parede em x=5 e y=5,
 * com a porta em (7, 5). Mesas com cadeira em (2, 2) e (3, 2). Spawn em (1, 1).
 */
const walls: [number, number][] = [];
for (let y = 1; y <= 5; y++) walls.push([5, y]);
for (let x = 6; x <= 10; x++) if (x !== 7) walls.push([x, 5]);
const ROOMS_MAP = buildTestMap({
  width: 12,
  height: 10,
  walls,
  zones: [{ key: 'sala', type: 'meeting', name: 'Sala', x: 6, y: 1, w: 4, h: 4 }],
  desks: [
    { key: 'mesa-1', x: 2, y: 1, orientation: 'down' },
    { key: 'mesa-2', x: 3, y: 1, orientation: 'down' },
  ],
  spawns: [[1, 1]],
});

const TO_DOOR: Dir[] = ['down', 'down', 'down', 'down', 'down', 'right', 'right', 'right', 'right', 'right', 'right', 'up'];
const TO_DESK_1: Dir[] = ['down', 'right'];
const TO_DESK_2: Dir[] = ['down', 'right', 'right'];

describe('salas de reunião e chamadas', () => {
  let server: TestServer;
  let media: FakeMedia;
  const bots: Bot[] = [];

  const zoneRoom = () => `zone:${server.spaceId}:sala`;
  const spaceRoom = () => `space:${server.spaceId}`;

  beforeAll(async () => {
    media = new FakeMedia();
    server = await startTestServer({ map: ROOMS_MAP, media });
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
    await bot.next('media.join');
    return { guest, bot };
  }

  async function enterRoom(u: { bot: Bot }): Promise<void> {
    await u.bot.walk(server.clock, [...TO_DOOR, 'up']);
  }

  const joins = (bot: Bot) => bot.inbox.filter((m): m is Extract<ServerMsg, { t: 'media.join' }> => m.t === 'media.join');

  async function position(guest: Guest): Promise<[number, number]> {
    const probe = await Bot.connect(server, await loginGuest(server));
    const welcome = await probe.next('welcome');
    probe.ws.terminate();
    await until(() => server.app.realtime.connections() === bots.length);
    const p = welcome.players.find((x) => x.id === guest.id);
    return [p?.x ?? -1, p?.y ?? -1];
  }

  describe('sala como sala de mídia', () => {
    it('entrar manda para a sala da zona com tela liberada; sair volta para space: e remove da zona', async () => {
      const a = await online();
      const b = await online();
      await enterRoom(a);
      const join = await a.bot.next('media.join');
      expect(join).toMatchObject({ room: zoneRoom(), token: `token:${zoneRoom()}:${a.guest.id}` });
      expect(media.tokens.find((t) => t.identity === a.guest.id && t.room === zoneRoom())?.sources).toContain(
        'screen_share',
      );
      // Ninguém fica na sala aberta durante a reunião, nem com cliente modificado.
      await until(() => media.removed.some((r) => r.room === spaceRoom() && r.identity === a.guest.id));
      const update = await b.bot.next('player.update', (m) => m.id === a.guest.id && m.patch.activity !== undefined);
      expect(update.patch).toEqual({ activity: 'meeting' });

      await a.bot.walk(server.clock, ['down']);
      expect((await a.bot.next('media.join')).room).toBe(spaceRoom());
      expect(media.removed).toContainEqual({ room: zoneRoom(), identity: a.guest.id });
      expect((await b.bot.next('player.update', (m) => m.id === a.guest.id)).patch).toEqual({ activity: 'idle' });
    });
  });

  describe('tranca e porta', () => {
    it('quem foi recusado na porta nunca recebe media.join nem token da sala', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      expect((await outside.bot.next('zone.state', (m) => m.zone.locked)).zone.occupants).toEqual([inside.guest.id]);

      await outside.bot.walk(server.clock, TO_DOOR);
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      const request = await inside.bot.next('zone.knockRequest');
      expect(request).toMatchObject({ zoneKey: 'sala', from: outside.guest.id });
      inside.bot.send({ t: 'zone.knockReply', requestId: request.requestId, allow: false });
      expect(await outside.bot.next('zone.knockResult')).toEqual({ t: 'zone.knockResult', zoneKey: 'sala', allowed: false });

      // Tenta entrar mesmo assim: a simulação recusa e a posição fica na porta.
      await outside.bot.walk(server.clock, ['up']);
      expect(await position(outside.guest)).toEqual([7, 5]);
      expect(media.roomsFor(outside.guest.id)).not.toContain(zoneRoom());
      expect(joins(outside.bot).map((j) => j.room)).not.toContain(zoneRoom());
    });

    it('batida aprovada deixa entrar e só então emite o token da sala', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (m) => m.zone.locked);
      await outside.bot.walk(server.clock, TO_DOOR);

      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      const request = await inside.bot.next('zone.knockRequest');
      expect(media.roomsFor(outside.guest.id)).not.toContain(zoneRoom());
      inside.bot.send({ t: 'zone.knockReply', requestId: request.requestId, allow: true });
      expect((await outside.bot.next('zone.knockResult')).allowed).toBe(true);

      await outside.bot.walk(server.clock, ['up']);
      expect((await outside.bot.next('media.join', (m) => m.room === zoneRoom())).room).toBe(zoneRoom());
    });

    it('batida sem resposta expira em 30 segundos como recusa', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (m) => m.zone.locked);
      await outside.bot.walk(server.clock, TO_DOOR);
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      await inside.bot.next('zone.knockRequest');

      server.clock.advance(KNOCK_TIMEOUT_MS - 1);
      await outside.bot.flush();
      expect(outside.bot.inbox.some((m) => m.t === 'zone.knockResult')).toBe(false);
      server.clock.advance(1);
      expect((await outside.bot.next('zone.knockResult')).allowed).toBe(false);
    });

    it('bater longe da porta ou em sala destrancada é recusado', async () => {
      const inside = await online();
      const outside = await online();
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      expect(await outside.bot.next('error')).toEqual({ t: 'error', code: 'not_locked' });

      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (m) => m.zone.locked);
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      expect(await outside.bot.next('error')).toEqual({ t: 'error', code: 'not_at_door' });
    });

    it('trancar de fora é recusado', async () => {
      const a = await online();
      a.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      expect(await a.bot.next('error')).toEqual({ t: 'error', code: 'not_in_zone' });
    });

    it('sala vazia destranca e limpa a lista de permitidos', async () => {
      const first = await online();
      const second = await online();
      await enterRoom(first);
      first.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await second.bot.next('zone.state', (m) => m.zone.locked);

      await first.bot.walk(server.clock, ['down', 'down']);
      const unlocked = await second.bot.next('zone.state', (m) => !m.zone.locked && m.zone.occupants.length === 0);
      expect(unlocked.zone).toEqual({ zoneKey: 'sala', locked: false, occupants: [] });

      // Quem estava na lista antiga não entra numa tranca nova.
      await second.bot.walk(server.clock, [...TO_DOOR, 'up']);
      second.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await first.bot.next('zone.state', (m) => m.zone.locked);
      await first.bot.walk(server.clock, ['up', 'up']);
      expect(await position(first.guest)).toEqual([7, 5]);
    });
    it('sala redesenhada por cima de quem está fora não fura a tranca', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (m) => m.zone.locked);
      await outside.bot.walk(server.clock, ['down', 'right']);

      // A sala passa a cobrir de x=2 em diante, incluindo a cadeira onde "outside" está.
      const bigger = buildTestMap({
        width: 12,
        height: 10,
        walls,
        zones: [{ key: 'sala', type: 'meeting', name: 'Sala', x: 2, y: 1, w: 8, h: 4 }],
        desks: [
          { key: 'mesa-1', x: 2, y: 1, orientation: 'down' },
          { key: 'mesa-2', x: 3, y: 1, orientation: 'down' },
        ],
        spawns: [[1, 1]],
      });
      const compiled = compileMap(bigger);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
      server.app.realtime.runtime(server.spaceId)?.replaceMap(compiled.map, 99);
      server.clock.advance(TICK_MS);
      expect(await position(outside.guest)).toEqual([1, 1]);
      expect(await position(inside.guest)).not.toEqual([1, 1]);
      expect(media.roomsFor(outside.guest.id)).not.toContain(zoneRoom());
    });
  });

  describe('chamadas', () => {
    async function seat(u: { guest: Guest; bot: Bot }, path: Dir[], deskKey: string): Promise<void> {
      await u.bot.walk(server.clock, path);
      const claim = await api(server, u.guest, 'POST', `/spaces/${server.spaceId}/desks/${deskKey}/claim`);
      expect(claim.status).toBe(201);
    }

    afterEach(async () => {
      // Libera as mesas para o próximo teste.
      const { deskAssignments } = await import('@pixelwork/shared/schema');
      await server.db.delete(deskAssignments);
      for (const key of ['mesa-1', 'mesa-2']) {
        server.app.realtime.runtime(server.spaceId)?.setDesk({ deskKey: key, userId: null, ownerName: null, decor: null });
      }
    });

    it('autor fora da própria mesa é recusado', async () => {
      const a = await online();
      const b = await online();
      a.bot.send({ t: 'call.invite', userId: b.guest.id });
      expect(await a.bot.next('error')).toEqual({ t: 'error', code: 'not_seated' });
      expect(b.bot.inbox.some((m) => m.t === 'call.incoming')).toBe(false);
    });

    it('destino em reunião gera busy', async () => {
      const a = await online();
      const b = await online();
      await seat(a, TO_DESK_1, 'mesa-1');
      await enterRoom(b);
      a.bot.send({ t: 'call.invite', userId: b.guest.id });
      expect((await a.bot.next('call.ended')).reason).toBe('busy');
    });

    it('sem resposta em 30 segundos gera timeout para os dois', async () => {
      const a = await online();
      const b = await online();
      await seat(a, TO_DESK_1, 'mesa-1');
      a.bot.send({ t: 'call.invite', userId: b.guest.id });
      const incoming = await b.bot.next('call.incoming');
      expect(incoming.from).toBe(a.guest.id);

      server.clock.advance(CALL_RING_TIMEOUT_MS);
      expect((await a.bot.next('call.ended')).reason).toBe('timeout');
      expect((await b.bot.next('call.ended')).callId).toBe(incoming.callId);
    });

    it('recusa avisa o autor', async () => {
      const a = await online();
      const b = await online();
      await seat(a, TO_DESK_1, 'mesa-1');
      a.bot.send({ t: 'call.invite', userId: b.guest.id });
      const incoming = await b.bot.next('call.incoming');
      b.bot.send({ t: 'call.reply', callId: incoming.callId, accept: false });
      expect((await a.bot.next('call.ended')).reason).toBe('declined');
    });

    it('chamada aceita leva os dois para a sala da chamada; ninguém mais recebe token dela', async () => {
      const a = await online();
      const b = await online();
      const c = await online();
      await seat(a, TO_DESK_1, 'mesa-1');
      a.bot.send({ t: 'call.invite', userId: b.guest.id });
      const incoming = await b.bot.next('call.incoming');
      const room = `call:${incoming.callId}`;

      // Terceiro tentando responder pela chamada alheia não entra.
      c.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      await c.bot.flush();
      expect(media.roomsFor(c.guest.id)).not.toContain(room);

      b.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      expect((await a.bot.next('media.join', (m) => m.room === room)).token).toBe(`token:${room}:${a.guest.id}`);
      expect((await b.bot.next('media.join', (m) => m.room === room)).token).toBe(`token:${room}:${b.guest.id}`);
      expect((await c.bot.next('player.update', (m) => m.id === b.guest.id)).patch).toEqual({ activity: 'call' });
      expect(media.roomsFor(c.guest.id)).not.toContain(room);

      // Levantar da mesa não encerra a chamada.
      await a.bot.walk(server.clock, ['left']);
      await a.bot.flush();
      expect(a.bot.inbox.some((m) => m.t === 'call.ended')).toBe(false);

      a.bot.send({ t: 'call.leave' });
      expect((await b.bot.next('call.ended')).reason).toBe('left');
      expect((await a.bot.next('media.join', (m) => m.room === spaceRoom())).room).toBe(spaceRoom());
      expect((await b.bot.next('media.join', (m) => m.room === spaceRoom())).room).toBe(spaceRoom());
      expect(media.removed).toEqual(
        expect.arrayContaining([
          { room, identity: a.guest.id },
          { room, identity: b.guest.id },
        ]),
      );
    });

    it('desconexão encerra a chamada', async () => {
      const a = await online();
      const b = await online();
      await seat(b, TO_DESK_2, 'mesa-2');
      b.bot.send({ t: 'call.invite', userId: a.guest.id });
      const incoming = await a.bot.next('call.incoming');
      a.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      await b.bot.next('media.join', (m) => m.room.startsWith('call:'));

      bots.splice(bots.indexOf(a.bot), 1);
      await a.bot.close();
      expect((await b.bot.next('call.ended')).reason).toBe('left');
    });
  });
});
