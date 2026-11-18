import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.ts';
import { createDb } from './db.ts';
import { createTestDatabase, type TestDatabase } from './test/database.ts';

describe('GET /health', () => {
  let database: TestDatabase;
  let conn: ReturnType<typeof createDb>;
  let app: ReturnType<typeof buildApp>;
  let baseUrl: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    conn = createDb(database.url);
    app = buildApp({ db: conn.db });
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
    await conn.pool.end();
    await database.drop();
  });

  it('responde 200 com o banco acessível', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('responde 503 quando o banco não responde', async () => {
    const broken = createDb('postgres://app:app@127.0.0.1:1/nada');
    const brokenApp = buildApp({ db: broken.db });
    try {
      const response = await brokenApp.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(503);
    } finally {
      await brokenApp.close();
      await broken.pool.end();
    }
  });
});
