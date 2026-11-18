import { describe, expect, it } from 'vitest';
import { NameBody, StatusBody, TitleBody, isSingleEmoji } from './validation.ts';

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
