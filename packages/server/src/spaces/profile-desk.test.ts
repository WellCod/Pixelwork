import { RECONNECT_GRACE_MS, type AvatarSpec, type DeskDecor, type ServerMsg } from '@pixelwork/shared';
import { spaceMembers } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { seedDemo } from '../demo.ts';
import {
  Bot,
  TEST_MAP,
  api,
  loginGuest,
  startTestServer,
  until,
  type Guest,
  type TestServer,
} from '../test/harness.ts';

// Da cadeira de cada mesa a partir do spawn (1, 1); as cadeiras ficam em (3,2), (5,2) e (7,2).
const TO_DESK_1 = ['down', 'right', 'right'] as const;
const DESK_1_TO_DESK_2 = ['right', 'right'] as const;

const AVATAR: AvatarSpec = {
  body: 'base',
  skin: 'dark',
  hair: 'long',
  hairColor: 'blond',
  outfit: 'hoodie',
  outfitColor: 'green',
  accessory: 'cap',
};

const DECOR: DeskDecor = {
  variant: 'dark',
  monitor: 'dual',
  slots: { left: 'mug', right: 'lamp', back: 'clock', floor: 'bin' },
};

describe('perfil, status, cargo e mesas', () => {
  let server: TestServer;
  let otherSpaceId: string;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer();
    otherSpaceId = await seedDemo(server.db, 'outro', TEST_MAP);
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  async function online(): Promise<{ guest: Guest; bot: Bot; welcome: Extract<ServerMsg, { t: 'welcome' }> }> {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    const welcome = await bot.next('welcome');
    return { guest, bot, welcome };
  }

  async function makeAdmin(guest: Guest): Promise<void> {
    await server.db
      .update(spaceMembers)
      .set({ role: 'admin' })
      .where(and(eq(spaceMembers.spaceId, server.spaceId), eq(spaceMembers.userId, guest.id)));
  }

  const space = (path: string) => `/spaces/${server.spaceId}${path}`;

  describe('perfil', () => {
    it('avatar grava e chega aos outros', async () => {
      const a = await online();
      const b = await online();
      expect((await api(server, a.guest, 'PUT', '/me/avatar', AVATAR)).status).toBe(200);
      const update = await b.bot.next('player.update', (m) => m.id === a.guest.id);
      expect(update.patch).toEqual({ avatar: AVATAR });
      const me = await api(server, a.guest, 'GET', '/me');
      expect(me.json).toMatchObject({ avatar: AVATAR });
    });

    it('avatar com peça fora do catálogo é recusado', async () => {
      const a = await online();
      const result = await api(server, a.guest, 'PUT', '/me/avatar', { ...AVATAR, hair: 'moicano' });
      expect(result.status).toBe(400);
    });

    it('nome grava e chega aos outros', async () => {
      const a = await online();
      const b = await online();
      expect((await api(server, a.guest, 'PUT', '/me/name', { name: '  Ana  ' })).status).toBe(200);
      const update = await b.bot.next('player.update', (m) => m.id === a.guest.id);
      expect(update.patch).toEqual({ name: 'Ana' });
      expect((await api(server, a.guest, 'PUT', '/me/name', { name: '' })).status).toBe(400);
    });

    it('status com texto e emoji grava e chega aos outros', async () => {
      const a = await online();
      const b = await online();
      const result = await api(server, a.guest, 'PUT', space('/me/status'), {
        status: 'focus',
        text: 'Escrevendo testes',
        emoji: '🧪',
      });
      expect(result.status).toBe(200);
      const update = await b.bot.next('player.update', (m) => m.id === a.guest.id);
      expect(update.patch).toEqual({ status: 'focus', statusText: 'Escrevendo testes', statusEmoji: '🧪' });

      const again = await online();
      expect(again.welcome.players.find((p) => p.id === a.guest.id)).toMatchObject({ statusEmoji: '🧪' });
    });

    it('status com dois emojis ou texto no lugar do emoji é recusado', async () => {
      const a = await online();
      for (const emoji of ['🧪🧪', 'ok']) {
        const result = await api(server, a.guest, 'PUT', space('/me/status'), { status: 'away', text: null, emoji });
        expect(result.status).toBe(400);
      }
    });

    it('cargo próprio grava e chega aos outros', async () => {
      const a = await online();
      const b = await online();
      expect((await api(server, a.guest, 'PUT', space('/me/title'), { title: 'Designer' })).status).toBe(200);
      const update = await b.bot.next('player.update', (m) => m.id === a.guest.id);
      expect(update.patch).toEqual({ title: 'Designer' });
    });

    it('cargo de outro membro só pelo admin', async () => {
      const a = await online();
      const b = await online();
      const path = space(`/members/${b.guest.id}/title`);
      expect((await api(server, a.guest, 'PUT', path, { title: 'Chefe' })).status).toBe(403);

      await makeAdmin(a.guest);
      expect((await api(server, a.guest, 'PUT', path, { title: 'Tech lead' })).status).toBe(200);
      const update = await b.bot.next('player.update', (m) => m.id === b.guest.id);
      expect(update.patch).toEqual({ title: 'Tech lead' });
    });
  });

  describe('mesas', () => {
    it('welcome traz todas as mesas do mapa', async () => {
      const a = await online();
      expect(a.welcome.desks.map((d) => d.deskKey).sort()).toEqual(['mesa-1', 'mesa-2', 'mesa-3']);
    });

    it('ocupar fora da cadeira é recusado', async () => {
      const a = await online();
      const result = await api(server, a.guest, 'POST', space('/desks/mesa-1/claim'));
      expect(result).toEqual({ status: 422, json: { error: 'not_on_chair' } });
    });

    it('ocupa, decora e libera, sempre avisando os outros', async () => {
      const a = await online();
      const b = await online();
      await a.bot.walk(server.clock, TO_DESK_1);

      const claim = await api(server, a.guest, 'POST', space('/desks/mesa-1/claim'));
      expect(claim.status).toBe(201);
      let updated = await b.bot.next('desk.updated');
      expect(updated.desk).toMatchObject({ deskKey: 'mesa-1', userId: a.guest.id });

      const decor = await api(server, a.guest, 'PUT', space('/desks/mesa-1/decor'), DECOR);
      expect(decor.status).toBe(200);
      updated = await b.bot.next('desk.updated');
      expect(updated.desk.decor).toEqual(DECOR);

      const late = await online();
      expect(late.welcome.desks.find((d) => d.deskKey === 'mesa-1')).toMatchObject({
        userId: a.guest.id,
        decor: DECOR,
      });

      expect((await api(server, a.guest, 'DELETE', space('/desks/mesa-1'))).status).toBe(204);
      updated = await b.bot.next('desk.updated');
      expect(updated.desk).toEqual({ deskKey: 'mesa-1', userId: null, ownerName: null, decor: null });
    });

    it('recusa quem já tem mesa e mesa ocupada', async () => {
      const a = await online();
      const b = await online();
      await a.bot.walk(server.clock, TO_DESK_1);
      expect((await api(server, a.guest, 'POST', space('/desks/mesa-1/claim'))).status).toBe(201);

      await a.bot.walk(server.clock, DESK_1_TO_DESK_2);
      const second = await api(server, a.guest, 'POST', space('/desks/mesa-2/claim'));
      expect(second).toEqual({ status: 409, json: { error: 'already_has_desk' } });

      await b.bot.walk(server.clock, TO_DESK_1);
      const taken = await api(server, b.guest, 'POST', space('/desks/mesa-1/claim'));
      expect(taken).toEqual({ status: 409, json: { error: 'desk_taken' } });

      await api(server, a.guest, 'DELETE', space('/desks/mesa-1'));
    });

    it('decorar e liberar: dono ou admin, mais ninguém', async () => {
      const owner = await online();
      const other = await online();
      const admin = await online();
      await makeAdmin(admin.guest);
      await owner.bot.walk(server.clock, TO_DESK_1);
      expect((await api(server, owner.guest, 'POST', space('/desks/mesa-1/claim'))).status).toBe(201);

      expect((await api(server, other.guest, 'PUT', space('/desks/mesa-1/decor'), DECOR)).status).toBe(403);
      expect((await api(server, owner.guest, 'PUT', space('/desks/mesa-1/decor'), { variant: 'x' })).status).toBe(
        400,
      );
      expect((await api(server, other.guest, 'DELETE', space('/desks/mesa-1'))).status).toBe(403);
      expect((await api(server, admin.guest, 'DELETE', space('/desks/mesa-1'))).status).toBe(204);
      expect((await api(server, admin.guest, 'DELETE', space('/desks/mesa-1'))).status).toBe(404);
    });

    it('trocar o nome atualiza a plaquinha da mesa', async () => {
      const a = await online();
      const b = await online();
      await a.bot.walk(server.clock, TO_DESK_1);
      await api(server, a.guest, 'POST', space('/desks/mesa-1/claim'));
      await b.bot.next('desk.updated');

      await api(server, a.guest, 'PUT', '/me/name', { name: 'Bia' });
      const updated = await b.bot.next('desk.updated');
      expect(updated.desk).toMatchObject({ deskKey: 'mesa-1', ownerName: 'Bia' });
      await api(server, a.guest, 'DELETE', space('/desks/mesa-1'));
    });
  });

  it('não membro recebe 404 em todas as rotas /spaces/:id desta fase', async () => {
    const outsider = await loginGuest(server);
    const someone = await loginGuest(server);
    const base = `/spaces/${otherSpaceId}`;
    const routes: [string, string, unknown][] = [
      ['GET', base, undefined],
      ['PUT', `${base}/me/status`, { status: 'away', text: null, emoji: null }],
      ['PUT', `${base}/me/title`, { title: 'x' }],
      ['PUT', `${base}/members/${someone.id}/title`, { title: 'x' }],
      ['POST', `${base}/desks/mesa-1/claim`, {}],
      ['PUT', `${base}/desks/mesa-1/decor`, DECOR],
      ['DELETE', `${base}/desks/mesa-1`, {}],
    ];
    for (const [method, path, body] of routes) {
      const result = await api(server, outsider, method, path, body);
      expect({ method, path, status: result.status }).toEqual({ method, path, status: 404 });
    }
  });
});
