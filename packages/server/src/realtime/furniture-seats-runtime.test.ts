import { RECONNECT_GRACE_MS, compileMap, frameOf, type Dir } from '@pixelwork/shared';
import { buildTestMap } from '@pixelwork/shared/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeMedia } from '../test/fake-media.ts';
import { Bot, loginGuest, startTestServer, until, type TestServer } from '../test/harness.ts';

const MAP = buildTestMap({
  width: 12, height: 10,
  furniture: [
    { tileset: 'furniture-2x1', tile: frameOf('furniture-2x1', 'sofa-sage'), x: 4, y: 3, w: 2 },
    { tileset: 'furniture-2x2', tile: frameOf('furniture-2x2', 'meeting-table-round'), x: 7, y: 5, w: 2, h: 2 },
  ],
  spawns: [[1, 1]],
});
const SOFA = 'sofa-sage@4,3:0';
const CHAIR = 'meeting-table-round@7,4:2';
const TO_SOFA: Dir[] = ['down', 'down', 'down', 'right', 'right', 'right'];

describe('assentos no runtime', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => { server = await startTestServer({ map: MAP, media: new FakeMedia() }); });
  afterEach(async () => {
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });
  afterAll(async () => { await server.stop(); });

  async function online() {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    await bot.next('welcome');
    return { guest, bot };
  }

  it('só reserva com o jogador perto, sincroniza a vaga e libera quando ele anda ou levanta', async () => {
    const alice = await online();
    const bob = await online();
    alice.bot.send({ t: 'furniture.sit', seatKey: SOFA });
    expect(await alice.bot.next('error')).toMatchObject({ code: 'furniture_seat_unavailable' });
    await alice.bot.walk(server.clock, TO_SOFA);
    await bob.bot.walk(server.clock, TO_SOFA);
    alice.bot.send({ t: 'furniture.sit', seatKey: SOFA });
    await bob.bot.next('player.update', (msg) => msg.id === alice.guest.id && msg.patch.seatedAt === SOFA);
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(alice.guest.id)).toEqual({ x: 4, y: 4 });

    bob.bot.send({ t: 'furniture.sit', seatKey: SOFA });
    expect(await bob.bot.next('error')).toMatchObject({ code: 'furniture_seat_taken' });
    await alice.bot.walk(server.clock, ['right', 'right']);
    await bob.bot.next('player.update', (msg) => msg.id === alice.guest.id && msg.patch.seatedAt === null);
    bob.bot.send({ t: 'furniture.sit', seatKey: SOFA });
    await alice.bot.next('player.update', (msg) => msg.id === bob.guest.id && msg.patch.seatedAt === SOFA);

    alice.bot.send({ t: 'furniture.sit', seatKey: CHAIR });
    await alice.bot.next('player.update', (msg) => msg.id === alice.guest.id && msg.patch.seatedAt === CHAIR);
    alice.bot.send({ t: 'furniture.stand' });
    await bob.bot.next('player.update', (msg) => msg.id === alice.guest.id && msg.patch.seatedAt === null);
    expect(server.app.realtime.runtime(server.spaceId)?.positionOf(alice.guest.id)).toEqual({ x: 6, y: 4 });
  });

  it('envia a vaga no welcome ao reconectar e a libera se o mapa for trocado', async () => {
    const alice = await online();
    await alice.bot.walk(server.clock, TO_SOFA);
    alice.bot.send({ t: 'furniture.sit', seatKey: SOFA });
    await alice.bot.next('player.update', (msg) => msg.patch.seatedAt === SOFA);
    await alice.bot.close();
    bots.splice(bots.indexOf(alice.bot), 1);
    await until(() => server.app.realtime.connections() === 0);
    const reconnected = await Bot.connect(server, alice.guest);
    bots.push(reconnected);
    const welcome = await reconnected.next('welcome');
    expect(welcome.players.find((player) => player.id === alice.guest.id)?.seatedAt).toBe(SOFA);

    const result = compileMap(MAP);
    const runtime = server.app.realtime.runtime(server.spaceId);
    if (!result.ok || !runtime) throw new Error('runtime de teste indisponível');
    runtime.replaceMap(result.map, welcome.mapVersion + 1);
    await reconnected.next('player.update', (msg) => msg.patch.seatedAt === null);
  });
});
