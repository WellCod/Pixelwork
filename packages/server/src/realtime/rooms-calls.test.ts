import {
  CALL_RING_TIMEOUT_MS,
  TICK_MS,
  compileMap,
  replay,
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
    await bot.next('media.join');
    return { guest, bot };
  }

  async function enterRoom(player: { bot: Bot }): Promise<void> {
    await player.bot.walk(server.clock, [...TO_DOOR, 'up']);
  }

  const joins = (bot: Bot) => bot.inbox.filter((message): message is Extract<ServerMsg, { t: 'media.join' }> => message.t === 'media.join');

  async function position(guest: Guest): Promise<[number, number]> {
    const probe = await Bot.connect(server, await loginGuest(server));
    const welcome = await probe.next('welcome');
    probe.socket.terminate();
    await until(() => server.app.realtime.connections() === bots.length);
    const player = welcome.players.find((candidate) => candidate.id === guest.id);
    return [player?.x ?? -1, player?.y ?? -1];
  }

  describe('sala como sala de mídia', () => {
    it('entrar manda para a sala da zona com tela liberada; sair volta para space: e remove da zona', async () => {
      const alice = await online();
      const bob = await online();
      await enterRoom(alice);
      const join = await alice.bot.next('media.join');
      expect(join).toMatchObject({ room: zoneRoom(), token: `token:${zoneRoom()}:${alice.guest.id}` });
      expect(media.tokens.find((token) => token.identity === alice.guest.id && token.room === zoneRoom())?.sources).toContain(
        'screen_share',
      );
      // Ninguém fica na sala aberta durante a reunião, nem com cliente modificado.
      await until(() => media.removed.some((removal) => removal.room === spaceRoom() && removal.identity === alice.guest.id));
      const update = await bob.bot.next('player.update', (message) => message.id === alice.guest.id && message.patch.activity !== undefined);
      expect(update.patch).toEqual({ activity: 'meeting' });

      await alice.bot.walk(server.clock, ['down']);
      expect((await alice.bot.next('media.join')).room).toBe(spaceRoom());
      expect(media.removed).toContainEqual({ room: zoneRoom(), identity: alice.guest.id });
      expect((await bob.bot.next('player.update', (message) => message.id === alice.guest.id)).patch).toEqual({ activity: 'idle' });
    });
  });

  describe('tranca e porta', () => {
    it('quem foi recusado na porta nunca recebe media.join nem token da sala', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      expect((await outside.bot.next('zone.state', (message) => message.zone.locked)).zone.occupants).toEqual([inside.guest.id]);

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
      expect(joins(outside.bot).map((join) => join.room)).not.toContain(zoneRoom());
    });

    it('batida aprovada deixa entrar e só então emite o token da sala', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (message) => message.zone.locked);
      await outside.bot.walk(server.clock, TO_DOOR);

      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      const request = await inside.bot.next('zone.knockRequest');
      expect(media.roomsFor(outside.guest.id)).not.toContain(zoneRoom());
      inside.bot.send({ t: 'zone.knockReply', requestId: request.requestId, allow: true });
      expect((await outside.bot.next('zone.knockResult')).allowed).toBe(true);

      await outside.bot.walk(server.clock, ['up']);
      expect((await outside.bot.next('media.join', (message) => message.room === zoneRoom())).room).toBe(zoneRoom());
    });

    it('batida sem resposta expira em 30 segundos como recusa', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (message) => message.zone.locked);
      await outside.bot.walk(server.clock, TO_DOOR);
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      await inside.bot.next('zone.knockRequest');

      server.clock.advance(KNOCK_TIMEOUT_MS - 1);
      await outside.bot.flush();
      expect(outside.bot.inbox.some((message) => message.t === 'zone.knockResult')).toBe(false);
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
      await outside.bot.next('zone.state', (message) => message.zone.locked);
      outside.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      expect(await outside.bot.next('error')).toEqual({ t: 'error', code: 'not_at_door' });
    });

    it('trancar de fora é recusado', async () => {
      const alice = await online();
      alice.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      expect(await alice.bot.next('error')).toEqual({ t: 'error', code: 'not_in_zone' });
    });

    it('sala vazia destranca e limpa a lista de permitidos', async () => {
      const first = await online();
      const second = await online();
      await enterRoom(first);
      first.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await second.bot.next('zone.state', (message) => message.zone.locked);

      await first.bot.walk(server.clock, ['down', 'down']);
      const unlocked = await second.bot.next('zone.state', (message) => !message.zone.locked && message.zone.occupants.length === 0);
      expect(unlocked.zone).toEqual({ zoneKey: 'sala', locked: false, occupants: [] });

      // Quem estava na lista antiga não entra numa tranca nova.
      await second.bot.walk(server.clock, [...TO_DOOR, 'up']);
      second.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await first.bot.next('zone.state', (message) => message.zone.locked);
      await first.bot.walk(server.clock, ['up', 'up']);
      expect(await position(first.guest)).toEqual([7, 5]);
    });
    it('sala redesenhada por cima de quem está fora não fura a tranca', async () => {
      const inside = await online();
      const outside = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await outside.bot.next('zone.state', (message) => message.zone.locked);
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

  describe('replay', () => {
    it('reproduzir a gravação chega às mesmas posições do servidor, com tranca e batida', async () => {
      const inside = await online();
      const knocker = await online();
      const walker = await online();
      await enterRoom(inside);
      inside.bot.send({ t: 'zone.lock', zoneKey: 'sala', locked: true });
      await knocker.bot.next('zone.state', (message) => message.zone.locked);
      // Quem não foi liberado bate na trancada e não entra; quem foi liberado entra.
      await knocker.bot.walk(server.clock, [...TO_DOOR, 'up']);
      await walker.bot.walk(server.clock, ['down', 'down', 'right', 'right', 'left', 'up']);
      knocker.bot.send({ t: 'zone.knock', zoneKey: 'sala' });
      const request = await inside.bot.next('zone.knockRequest');
      inside.bot.send({ t: 'zone.knockReply', requestId: request.requestId, allow: true });
      await knocker.bot.next('zone.knockResult');
      await knocker.bot.walk(server.clock, ['up', 'up']);
      server.clock.advance(TICK_MS);

      const runtime = server.app.realtime.runtime(server.spaceId);
      if (!runtime) throw new Error('sem runtime');
      const recording = runtime.recording();
      // O mapa do runtime, não o da fixture: um teste anterior troca o mapa deste servidor.
      const replayed = replay(runtime.compiledMap(), recording);
      for (const participant of [inside, knocker, walker]) {
        const replayedPlayer = replayed.players.get(participant.guest.id);
        expect([replayedPlayer?.x, replayedPlayer?.y]).toEqual(await position(participant.guest));
      }
      expect(recording.events.some((event) => event.type === 'lock' && event.locked)).toBe(true);

      const admin = await api(server, inside.guest, 'GET', `/spaces/${server.spaceId}/replay`);
      expect(admin.status).toBe(403);
    });
  });

  describe('chamadas', () => {
    async function seat(player: { guest: Guest; bot: Bot }, path: Dir[], deskKey: string): Promise<void> {
      await player.bot.walk(server.clock, path);
      const claim = await api(server, player.guest, 'POST', `/spaces/${server.spaceId}/desks/${deskKey}/claim`);
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
      const alice = await online();
      const bob = await online();
      alice.bot.send({ t: 'call.invite', userId: bob.guest.id });
      expect(await alice.bot.next('error')).toEqual({ t: 'error', code: 'not_seated' });
      expect(bob.bot.inbox.some((message) => message.t === 'call.incoming')).toBe(false);
    });

    it('destino em reunião gera busy', async () => {
      const alice = await online();
      const bob = await online();
      await seat(alice, TO_DESK_1, 'mesa-1');
      await enterRoom(bob);
      alice.bot.send({ t: 'call.invite', userId: bob.guest.id });
      expect((await alice.bot.next('call.ended')).reason).toBe('busy');
    });

    it('sem resposta em 30 segundos gera timeout para os dois', async () => {
      const alice = await online();
      const bob = await online();
      await seat(alice, TO_DESK_1, 'mesa-1');
      alice.bot.send({ t: 'call.invite', userId: bob.guest.id });
      const incoming = await bob.bot.next('call.incoming');
      expect(incoming.from).toBe(alice.guest.id);

      server.clock.advance(CALL_RING_TIMEOUT_MS);
      expect((await alice.bot.next('call.ended')).reason).toBe('timeout');
      expect((await bob.bot.next('call.ended')).callId).toBe(incoming.callId);
    });

    it('recusa avisa o autor', async () => {
      const alice = await online();
      const bob = await online();
      await seat(alice, TO_DESK_1, 'mesa-1');
      alice.bot.send({ t: 'call.invite', userId: bob.guest.id });
      const incoming = await bob.bot.next('call.incoming');
      bob.bot.send({ t: 'call.reply', callId: incoming.callId, accept: false });
      expect((await alice.bot.next('call.ended')).reason).toBe('declined');
    });

    it('chamada aceita leva os dois para a sala da chamada; ninguém mais recebe token dela', async () => {
      const alice = await online();
      const bob = await online();
      const carol = await online();
      await seat(alice, TO_DESK_1, 'mesa-1');
      alice.bot.send({ t: 'call.invite', userId: bob.guest.id });
      const incoming = await bob.bot.next('call.incoming');
      const room = `call:${incoming.callId}`;

      // Terceiro tentando responder pela chamada alheia não entra.
      carol.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      await carol.bot.flush();
      expect(media.roomsFor(carol.guest.id)).not.toContain(room);

      bob.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      expect((await alice.bot.next('media.join', (message) => message.room === room)).token).toBe(`token:${room}:${alice.guest.id}`);
      expect((await bob.bot.next('media.join', (message) => message.room === room)).token).toBe(`token:${room}:${bob.guest.id}`);
      expect((await carol.bot.next('player.update', (message) => message.id === bob.guest.id)).patch).toEqual({ activity: 'call' });
      expect(media.roomsFor(carol.guest.id)).not.toContain(room);

      // Levantar da mesa não encerra a chamada.
      await alice.bot.walk(server.clock, ['left']);
      await alice.bot.flush();
      expect(alice.bot.inbox.some((message) => message.t === 'call.ended')).toBe(false);

      alice.bot.send({ t: 'call.leave' });
      expect((await bob.bot.next('call.ended')).reason).toBe('left');
      expect((await alice.bot.next('media.join', (message) => message.room === spaceRoom())).room).toBe(spaceRoom());
      expect((await bob.bot.next('media.join', (message) => message.room === spaceRoom())).room).toBe(spaceRoom());
      expect(media.removed).toEqual(
        expect.arrayContaining([
          { room, identity: alice.guest.id },
          { room, identity: bob.guest.id },
        ]),
      );
    });

    it('desconexão encerra a chamada', async () => {
      const alice = await online();
      const bob = await online();
      await seat(bob, TO_DESK_2, 'mesa-2');
      bob.bot.send({ t: 'call.invite', userId: alice.guest.id });
      const incoming = await alice.bot.next('call.incoming');
      alice.bot.send({ t: 'call.reply', callId: incoming.callId, accept: true });
      await bob.bot.next('media.join', (message) => message.room.startsWith('call:'));

      bots.splice(bots.indexOf(alice.bot), 1);
      await alice.bot.close();
      expect((await bob.bot.next('call.ended')).reason).toBe('left');
    });
  });
});
