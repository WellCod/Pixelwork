import { CHAT_MAX_CHARS, RECONNECT_GRACE_MS, type ServerMsg } from '@pixelwork/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Bot, loginGuest, startTestServer, until, type TestServer } from '../test/harness.ts';

function jwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}

describe('mídia e chat', () => {
  let server: TestServer;
  const bots: Bot[] = [];

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((bot) => bot.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  async function online() {
    const guest = await loginGuest(server);
    const bot = await Bot.connect(server, guest);
    bots.push(bot);
    await bot.next('welcome');
    return { guest, bot };
  }

  const said = (bot: Bot) => bot.inbox.filter((message): message is Extract<ServerMsg, { t: 'chat.said' }> => message.t === 'chat.said');

  describe('media.join', () => {
    it('chega depois do welcome com token da sala space: para o próprio usuário', async () => {
      const { guest, bot } = await online();
      const join = await bot.next('media.join');
      expect(join.room).toBe(`space:${server.spaceId}`);
      expect(join.url).toBe('ws://localhost:7880');

      const payload = jwtPayload(join.token);
      expect(payload.sub).toBe(guest.id);
      expect(payload.video).toMatchObject({
        room: `space:${server.spaceId}`,
        roomJoin: true,
        canSubscribe: true,
        canPublishSources: ['camera', 'microphone'],
      });
    });
  });

  describe('chat', () => {
    it('chega a quem está perto, inclusive o autor, e não a quem está longe', async () => {
      const author = await online();
      const near = await online();
      const far = await online();
      await far.bot.walk(server.clock, ['down', 'down', 'down', 'down', 'right', 'right', 'right', 'right', 'right']);

      author.bot.send({ t: 'chat.say', text: '  oi, pessoal  ' });
      const got = await near.bot.next('chat.said');
      expect(got).toEqual({ t: 'chat.said', from: author.guest.id, text: 'oi, pessoal' });
      await author.bot.next('chat.said');

      await far.bot.flush();
      await author.bot.flush();
      expect(said(far.bot)).toEqual([]);
    });

    it('limite de uma por segundo com rajada de três', async () => {
      const { bot } = await online();
      for (let i = 0; i < 4; i++) bot.send({ t: 'chat.say', text: `msg ${i}` });
      expect(await bot.next('error')).toEqual({ t: 'error', code: 'chat_rate' });
      expect(said(bot).map((message) => message.text)).toEqual(['msg 0', 'msg 1', 'msg 2']);

      server.clock.advance(1000);
      bot.send({ t: 'chat.say', text: 'de novo' });
      expect((await bot.next('chat.said', (message) => message.text === 'de novo')).text).toBe('de novo');
    });

    it('recusa texto vazio e longo demais', async () => {
      const { bot } = await online();
      bot.send({ t: 'chat.say', text: '   ' });
      expect(await bot.next('error')).toEqual({ t: 'error', code: 'chat_invalid' });
      bot.send({ t: 'chat.say', text: 'a'.repeat(CHAT_MAX_CHARS + 1) });
      expect(await bot.next('error')).toEqual({ t: 'error', code: 'chat_invalid' });
      bot.send({ t: 'chat.say', text: 'a'.repeat(CHAT_MAX_CHARS) });
      expect((await bot.next('chat.said')).text).toHaveLength(CHAT_MAX_CHARS);
    });
  });
});
