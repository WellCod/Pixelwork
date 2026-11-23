import { describe, expect, it } from 'vitest';
import { NameBody, StatusBody, TitleBody, isSingleEmoji } from './validation.ts';
import { ClientMsg } from './protocol.ts';

describe('isSingleEmoji', () => {
  it.each(['🙂', '👩‍💻', '👍🏽', '🇧🇷', '1️⃣', '❤️'])('aceita %s', (emoji) => {
    expect(isSingleEmoji(emoji)).toBe(true);
  });

  it.each([
    ['dois grafemas', '🙂🙂'],
    ['emoji e texto', '🙂a'],
    ['letra', 'a'],
    ['dígito sem keycap', '1'],
    ['texto comum', 'ok'],
    ['vazio', ''],
  ])('recusa %s', (_name, value) => {
    expect(isSingleEmoji(value)).toBe(false);
  });
});

describe('corpos das rotas', () => {
  it('status aceita emoji único e transforma vazio em null', () => {
    expect(StatusBody.parse({ status: 'focus', text: '  ', emoji: '' })).toEqual({
      status: 'focus',
      text: null,
      emoji: null,
    });
    expect(StatusBody.safeParse({ status: 'away', text: null, emoji: '🙂🙂' }).success).toBe(false);
    expect(StatusBody.safeParse({ status: 'away', text: null, emoji: 'x' }).success).toBe(false);
  });

  it('conta tamanho em code points, como o Postgres', () => {
    expect(TitleBody.safeParse({ title: '🙂'.repeat(40) }).success).toBe(true);
    expect(TitleBody.safeParse({ title: 'a'.repeat(41) }).success).toBe(false);
    expect(StatusBody.safeParse({ status: 'available', text: 'a'.repeat(81), emoji: null }).success).toBe(false);
  });

  it('nome não pode ser vazio depois do trim', () => {
    expect(NameBody.safeParse({ name: '   ' }).success).toBe(false);
    expect(NameBody.parse({ name: '  Ana  ' })).toEqual({ name: 'Ana' });
  });
});

describe('mensagens do pingpong', () => {
  it('game.input aceita só -1, 0 e 1', () => {
    for (const dir of [-1, 0, 1]) expect(ClientMsg.safeParse({ t: 'game.input', seq: 1, dir }).success).toBe(true);
    for (const dir of [2, 0.5, '1']) expect(ClientMsg.safeParse({ t: 'game.input', seq: 1, dir }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: 'game.input', seq: -1, dir: 0 }).success).toBe(false);
  });

  it('game.join exige tableKey', () => {
    expect(ClientMsg.safeParse({ t: 'game.join', tableKey: 'ping-pong@29,16' }).success).toBe(true);
    expect(ClientMsg.safeParse({ t: 'game.join' }).success).toBe(false);
    expect(ClientMsg.safeParse({ t: 'game.join', tableKey: '' }).success).toBe(false);
  });

  it('game.bot, game.rematch e game.leave sem campos', () => {
    for (const t of ['game.bot', 'game.rematch', 'game.leave']) expect(ClientMsg.safeParse({ t }).success).toBe(true);
  });
});
