import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_ORIGIN, loginGuest, startTestServer, type TestServer } from '../test/harness.ts';

describe('auth de convidado', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.stop();
  });

  const get = (path: string, cookie?: string) =>
    fetch(`${server.baseUrl}${path}`, { headers: cookie ? { cookie } : {} });

  it('cria convidado com cookie HttpOnly e membro do coworking de demo', async () => {
    const response = await fetch(`${server.baseUrl}/auth/guest`, {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(response.status).toBe(201);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^sid=[\w-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=86400$/);
    const me = (await response.json()) as { name: string; isGuest: boolean };
    expect(me.name).toMatch(/^Visitante \d{4}$/);
    expect(me.isGuest).toBe(true);

    const cookie = setCookie.split(';')[0];
    const spaces = (await (await get('/spaces', cookie)).json()) as { id: string }[];
    expect(spaces.map((s) => s.id)).toEqual([server.spaceId]);
  });

  it('GET /me devolve o usuário da sessão e 401 sem ela', async () => {
    const guest = await loginGuest(server);
    const me = (await (await get('/me', guest.cookie)).json()) as { id: string };
    expect(me.id).toBe(guest.id);
    expect((await get('/me')).status).toBe(401);
    expect((await get('/me', 'sid=inventado')).status).toBe(401);
  });

  it('logout apaga a sessão', async () => {
    const guest = await loginGuest(server);
    const response = await fetch(`${server.baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/json', cookie: guest.cookie },
      body: '{}',
    });
    expect(response.status).toBe(204);
    expect((await get('/me', guest.cookie)).status).toBe(401);
  });

  it('recusa Origin diferente e corpo que não é JSON em rota que altera estado', async () => {
    const badOrigin = await fetch(`${server.baseUrl}/auth/guest`, {
      method: 'POST',
      headers: { origin: 'http://evil.test', 'content-type': 'application/json' },
      body: '{}',
    });
    expect(badOrigin.status).toBe(403);

    const form = await fetch(`${server.baseUrl}/auth/guest`, {
      method: 'POST',
      headers: { origin: TEST_ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'a=1',
    });
    expect(form.status).toBe(415);
  });

  it('GET /spaces/:id responde 404 para id inexistente ou malformado', async () => {
    const guest = await loginGuest(server);
    const ok = await get(`/spaces/${server.spaceId}`, guest.cookie);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { mapVersion: number }).mapVersion).toBe(1);
    expect((await get('/spaces/0190a000-0000-7000-8000-000000000000', guest.cookie)).status).toBe(404);
    expect((await get('/spaces/nao-e-uuid', guest.cookie)).status).toBe(404);
  });
});
