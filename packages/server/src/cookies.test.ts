import { describe, expect, it } from 'vitest';
import { parseCookies, serializeCookie } from './cookies.ts';

describe('cookies', () => {
  it('lê pares, decodifica e mantém o primeiro em caso de repetição', () => {
    expect(parseCookies('a=1; sid=abc%3D; a=2; lixo; =x')).toEqual({ a: '1', sid: 'abc=' });
    expect(parseCookies(undefined)).toEqual({});
  });

  it('ignora valor com escape inválido', () => {
    expect(parseCookies('a=%E0%A4%A; b=2')).toEqual({ b: '2' });
  });

  it('serializa com HttpOnly, SameSite=Lax e Secure conforme a opção', () => {
    expect(serializeCookie('sid', 'x', { maxAgeSeconds: 60, secure: true })).toBe(
      'sid=x; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure',
    );
  });
});
