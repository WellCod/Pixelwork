import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

const devEnv = {
  DATABASE_URL: 'postgres://app:app@localhost:5432/coworking',
  PUBLIC_URL: 'http://localhost:5173',
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'secret',
  SESSION_COOKIE_SECURE: 'false',
  DEMO_SPACE_SLUG: 'demo',
};

const prodEnv = {
  DATABASE_URL: 'postgres://app:uma-senha-longa-e-boa@postgres:5432/coworking',
  PUBLIC_URL: 'https://pixelwork.example.com',
  LIVEKIT_URL: 'wss://livekit.pixelwork.example.com',
  LIVEKIT_API_KEY: 'APIabc123',
  LIVEKIT_API_SECRET: 'x'.repeat(40),
  SESSION_COOKIE_SECURE: 'true',
  DEMO_SPACE_SLUG: 'demo',
};

describe('loadEnv', () => {
  it('aceita os valores de desenvolvimento com http', () => {
    expect(loadEnv(devEnv).LIVEKIT_API_KEY).toBe('devkey');
  });

  it('aceita produção configurada', () => {
    expect(loadEnv(prodEnv).PUBLIC_URL).toBe('https://pixelwork.example.com');
  });

  it.each([
    ['chave de dev do LiveKit', { LIVEKIT_API_KEY: 'devkey' }, 'LIVEKIT_API_KEY'],
    ['segredo curto', { LIVEKIT_API_SECRET: 'secret' }, 'LIVEKIT_API_SECRET'],
    ['cookie sem Secure', { SESSION_COOKIE_SECURE: 'false' }, 'SESSION_COOKIE_SECURE'],
    ['teste de carga ligado', { LOAD_TEST: 'true' }, 'LOAD_TEST'],
    ['senha de exemplo', { DATABASE_URL: 'postgres://app:troque-esta-senha@postgres:5432/coworking' }, 'DATABASE_URL'],
  ])('recusa em produção: %s', (_name, patch, field) => {
    expect(() => loadEnv({ ...prodEnv, ...patch })).toThrow(field);
  });
});
