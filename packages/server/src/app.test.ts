import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, maskUrl } from './app.ts';
import { createDb } from './db.ts';
import { TEST_CONFIG, startTestServer, type TestServer } from './test/harness.ts';

describe('GET /health', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('responde 200 com o banco acessível', async () => {
    const response = await fetch(`${server.baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('responde 503 quando o banco não responde', async () => {
    // Porta 1: nada escuta ali, a consulta do health falha na hora.
    const brokenDatabase = createDb('postgres://app:app@127.0.0.1:1/nada');
    const brokenApp = buildApp({ db: brokenDatabase.db, config: TEST_CONFIG });
    try {
      const response = await brokenApp.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
    } finally {
      await brokenApp.close();
      await brokenDatabase.pool.end();
    }
  });
});

describe('maskUrl', () => {
  it('esconde o token do convite no caminho e deixa o resto', () => {
    expect(maskUrl('/invites/abc123/accept')).toBe('/invites/***/accept');
    expect(maskUrl('/invites/abc123')).toBe('/invites/***');
    expect(maskUrl('/spaces/x/invites')).toBe('/spaces/x/invites');
  });
});
