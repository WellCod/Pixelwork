import { CLOSE_REMOVED, RECONNECT_GRACE_MS, type DeskDecor } from '@pixelwork/shared';
import { deskAssignments, invites, spaceMembers } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { GitHubClient, GitHubUser } from '../auth/github.ts';
import { seedDemo } from '../demo.ts';
import {
  Bot,
  TEST_MAP,
  TEST_ORIGIN,
  api,
  loginGuest,
  startTestServer,
  until,
  type Guest,
  type TestServer,
} from '../test/harness.ts';

class FakeGitHub implements GitHubClient {
  calls = 0;
  profile: GitHubUser = { id: 4242, login: 'octocat', name: 'Mona Lisa Octocat' };
  exchangeCode(code: string): Promise<string> {
    this.calls++;
    return code === 'bom' ? Promise.resolve('token-github') : Promise.reject(new Error('código ruim'));
  }
  user(): Promise<GitHubUser> {
    return Promise.resolve(this.profile);
  }
}

const DECOR: DeskDecor = { variant: 'basic', monitor: 'single', slots: { left: null, right: null, back: null, floor: null } };

describe('multi-coworking', () => {
  let server: TestServer;
  let github: FakeGitHub;
  let otherSpaceId: string;
  const bots: Bot[] = [];

  beforeAll(async () => {
    github = new FakeGitHub();
    server = await startTestServer({ github });
    otherSpaceId = await seedDemo(server.db, 'fechado', TEST_MAP);
  });

  afterEach(async () => {
    await Promise.all(bots.splice(0).map((b) => b.close()));
    await until(() => server.app.realtime.connections() === 0);
    server.clock.advance(RECONNECT_GRACE_MS + 1);
  });

  afterAll(async () => {
    await server.stop();
  });

  /** Login pelo GitHub com o dublê: segue o redirect de /auth/github e chama o callback. */
  async function loginGitHub(code = 'bom', tamper?: (state: string) => string | undefined): Promise<Response> {
    const start = await fetch(`${server.baseUrl}/auth/github`, { redirect: 'manual' });
    const location = new URL(start.headers.get('location') ?? '');
    const state = location.searchParams.get('state') ?? '';
    const cookie = (start.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const sentState = tamper ? tamper(state) : state;
    const query = new URLSearchParams({ code, ...(sentState === undefined ? {} : { state: sentState }) });
    return fetch(`${server.baseUrl}/auth/github/callback?${query.toString()}`, { redirect: 'manual', headers: { cookie } });
  }

  const sessionFrom = (response: Response): Guest | null => {
    const sid = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .find((c) => c.startsWith('sid=') && c !== 'sid=');
    return sid ? { id: '', cookie: sid } : null;
  };

  async function githubAccount(id: number, login: string): Promise<Guest> {
    github.profile = { id, login, name: null };
    const response = await loginGitHub();
    const account = sessionFrom(response);
    if (!account) throw new Error('login pelo github não criou sessão');
    const me = await api(server, account, 'GET', '/me');
    return { ...account, id: (me.json as { id: string }).id };
  }

  describe('github oauth', () => {
    it('redireciona para o github com o state guardado em cookie de curta duração', async () => {
      const start = await fetch(`${server.baseUrl}/auth/github`, { redirect: 'manual' });
      expect(start.status).toBe(302);
      const location = new URL(start.headers.get('location') ?? '');
      expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(location.searchParams.get('redirect_uri')).toBe(`${TEST_ORIGIN}/auth/github/callback`);
      expect(start.headers.get('set-cookie')).toMatch(/^oauth_state=[\w-]+; Path=\/auth\/github; HttpOnly; SameSite=Lax; Max-Age=600$/);
    });

    it('callback válido cria a conta, vincula ao github e abre sessão de 30 dias', async () => {
      github.profile = { id: 1001, login: 'ana-dev', name: 'Ana' };
      const response = await loginGitHub();
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/');
      expect(response.headers.getSetCookie().find((c) => c.startsWith('sid='))).toMatch(/Max-Age=2592000/);
      const me = await api(server, sessionFrom(response) as Guest, 'GET', '/me');
      expect(me.json).toMatchObject({ name: 'Ana', isGuest: false });

      // Segundo login com o mesmo id do github cai na mesma conta.
      const again = await api(server, sessionFrom(await loginGitHub()) as Guest, 'GET', '/me');
      expect((again.json as { id: string }).id).toBe((me.json as { id: string }).id);
    });

    it('callback com state divergente ou ausente é recusado sem falar com o github', async () => {
      const before = github.calls;
      for (const tamper of [(s: string) => `${s}x`, () => undefined]) {
        const response = await loginGitHub('bom', tamper);
        expect(response.headers.get('location')).toBe('/?erro=github');
        expect(sessionFrom(response)).toBeNull();
      }
      expect(github.calls).toBe(before);
    });

    it('código recusado pelo github volta para o app com erro e sem sessão', async () => {
      const response = await loginGitHub('ruim');
      expect(response.headers.get('location')).toBe('/?erro=github');
      expect(sessionFrom(response)).toBeNull();
    });
  });

  describe('empresas e coworkings', () => {
    it('conta cria empresa e coworking a partir de template e vira admin', async () => {
      const owner = await githubAccount(2001, 'dona');
      const org = await api(server, owner, 'POST', '/orgs', { name: 'Acme', slug: 'acme' });
      expect(org.status).toBe(201);
      const orgId = (org.json as { id: string }).id;
      const space = await api(server, owner, 'POST', `/orgs/${orgId}/spaces`, {
        name: 'Acme HQ',
        slug: 'hq',
        template: 'small-office',
      });
      expect(space.status).toBe(201);
      const list = (await api(server, owner, 'GET', '/spaces')).json as { id: string; role: string; orgRole: string }[];
      expect(list.find((s) => s.id === (space.json as { id: string }).id)).toMatchObject({ role: 'admin', orgRole: 'owner' });

      expect((await api(server, owner, 'POST', '/orgs', { name: 'Outra', slug: 'acme' })).status).toBe(409);
      const outsider = await githubAccount(2002, 'intrusa');
      const denied = await api(server, outsider, 'POST', `/orgs/${orgId}/spaces`, { name: 'x', slug: 'x', template: 'small-office' });
      expect(denied.status).toBe(404);
    });

    it('convidado não cria empresa', async () => {
      const guest = await loginGuest(server);
      expect((await api(server, guest, 'POST', '/orgs', { name: 'G', slug: 'g' })).status).toBe(403);
    });
  });

  describe('convites', () => {
    async function adminOfOther(): Promise<Guest> {
      const admin = await githubAccount(3000 + Math.floor(Math.random() * 1000), 'admin');
      await server.db.insert(spaceMembers).values({ spaceId: otherSpaceId, userId: admin.id, role: 'admin' }).onConflictDoNothing();
      return admin;
    }

    async function invite(admin: Guest, body: Record<string, unknown> = {}): Promise<string> {
      const created = await api(server, admin, 'POST', `/spaces/${otherSpaceId}/invites`, body);
      expect(created.status).toBe(201);
      const url = (created.json as { url: string }).url;
      expect(url.startsWith(`${TEST_ORIGIN}/invite/`)).toBe(true);
      return url.split('/invite/')[1] ?? '';
    }

    it('aceitar entra no coworking com o papel do convite e o token fica só como hash', async () => {
      const admin = await adminOfOther();
      const token = await invite(admin, { role: 'admin', maxUses: 2 });
      const stored = await server.db.select().from(invites).where(eq(invites.spaceId, otherSpaceId));
      expect(stored.every((i) => !Buffer.from(i.tokenHash).toString('utf8').includes(token))).toBe(true);

      const joiner = await loginGuest(server);
      const preview = await api(server, joiner, 'GET', `/invites/${token}`);
      expect(preview.json).toMatchObject({ spaceId: otherSpaceId, role: 'admin', alreadyMember: false });
      expect((await api(server, joiner, 'POST', `/invites/${token}/accept`)).status).toBe(201);
      const spaces = (await api(server, joiner, 'GET', '/spaces')).json as { id: string; role: string }[];
      expect(spaces.find((s) => s.id === otherSpaceId)?.role).toBe('admin');
    });

    it('expirado, sem usos restantes, já membro e token inexistente', async () => {
      const admin = await adminOfOther();
      const token = await invite(admin, { expiresInHours: 1, maxUses: 1 });

      const first = await loginGuest(server);
      expect((await api(server, first, 'POST', `/invites/${token}/accept`)).status).toBe(201);
      expect(await api(server, first, 'POST', `/invites/${token}/accept`)).toEqual({ status: 409, json: { error: 'already_member' } });

      const second = await loginGuest(server);
      expect(await api(server, second, 'POST', `/invites/${token}/accept`)).toEqual({ status: 410, json: { error: 'invite_used_up' } });

      const expiring = await invite(admin, { expiresInHours: 1 });
      server.clock.advance(3_600_000);
      const late = await loginGuest(server);
      expect(await api(server, late, 'POST', `/invites/${expiring}/accept`)).toEqual({ status: 410, json: { error: 'invite_expired' } });

      expect((await api(server, late, 'POST', '/invites/nao-existe/accept')).status).toBe(404);
    });

    it('só admin cria convite', async () => {
      const member = await loginGuest(server);
      await server.db.insert(spaceMembers).values({ spaceId: otherSpaceId, userId: member.id, role: 'member' });
      expect((await api(server, member, 'POST', `/spaces/${otherSpaceId}/invites`, {})).status).toBe(403);
    });
  });

  describe('papéis', () => {
    it('remover um membro libera a mesa e o desconecta do coworking', async () => {
      const admin = await loginGuest(server);
      await server.db
        .update(spaceMembers)
        .set({ role: 'admin' })
        .where(and(eq(spaceMembers.spaceId, server.spaceId), eq(spaceMembers.userId, admin.id)));
      const target = await loginGuest(server);
      const adminBot = await Bot.connect(server, admin);
      const targetBot = await Bot.connect(server, target);
      bots.push(adminBot);
      await adminBot.next('welcome');
      await targetBot.next('welcome');
      await targetBot.walk(server.clock, ['down', 'right', 'right']);
      expect((await api(server, target, 'POST', `/spaces/${server.spaceId}/desks/mesa-1/claim`)).status).toBe(201);
      await adminBot.next('desk.updated', (m) => m.desk.userId === target.id);
      expect((await api(server, target, 'PUT', `/spaces/${server.spaceId}/desks/mesa-1/decor`, DECOR)).status).toBe(200);

      const member = await loginGuest(server);
      expect((await api(server, member, 'DELETE', `/spaces/${server.spaceId}/members/${target.id}`)).status).toBe(403);
      expect((await api(server, admin, 'DELETE', `/spaces/${server.spaceId}/members/${target.id}`)).status).toBe(204);

      expect(await targetBot.closed).toBe(CLOSE_REMOVED);
      expect((await adminBot.next('player.leave', (m) => m.id === target.id)).id).toBe(target.id);
      expect((await adminBot.next('desk.updated', (m) => m.desk.deskKey === 'mesa-1' && m.desk.userId === null)).desk.decor).toBeNull();
      const rows = await server.db.select().from(deskAssignments).where(eq(deskAssignments.userId, target.id));
      expect(rows).toEqual([]);
      expect((await api(server, target, 'GET', `/spaces/${server.spaceId}`)).status).toBe(404);
      await expect(Bot.connect(server, target)).rejects.toThrow('HTTP 404');
    });

    it('o último admin não sai nem é removido; com outro admin, pode sair', async () => {
      const owner = await githubAccount(2101, 'unica-admin');
      const org = await api(server, owner, 'POST', '/orgs', { name: 'Solo', slug: 'solo' });
      const orgId = (org.json as { id: string }).id;
      const created = await api(server, owner, 'POST', `/orgs/${orgId}/spaces`, {
        name: 'Solo HQ',
        slug: 'solo-hq',
        template: 'small-office',
      });
      const spaceId = (created.json as { id: string }).id;
      const leave = await api(server, owner, 'DELETE', `/spaces/${spaceId}/members/${owner.id}`);
      expect(leave).toEqual({ status: 409, json: { error: 'last_admin' } });

      const second = await githubAccount(2102, 'segunda-admin');
      await server.db.insert(spaceMembers).values({ spaceId, userId: second.id, role: 'admin' });
      expect((await api(server, owner, 'DELETE', `/spaces/${spaceId}/members/${owner.id}`)).status).toBe(204);
      expect((await api(server, second, 'DELETE', `/spaces/${spaceId}/members/${second.id}`)).status).toBe(409);
    });

    it('qualquer membro pode sair', async () => {
      const guest = await loginGuest(server);
      expect((await api(server, guest, 'DELETE', `/spaces/${server.spaceId}/members/${guest.id}`)).status).toBe(204);
      expect((await api(server, guest, 'GET', '/spaces')).json).toEqual([]);
    });
  });

  describe('isolamento de tenant', () => {
    // Corpo usado em cada rota; uma rota nova sem entrada aqui faz o teste falhar.
    const BODIES: Record<string, unknown> = {
      'GET /spaces/:spaceId': undefined,
      'PUT /spaces/:spaceId/me/status': { status: 'away', text: null, emoji: null },
      'PUT /spaces/:spaceId/me/title': { title: 'x' },
      'PUT /spaces/:spaceId/members/:userId/title': { title: 'x' },
      'DELETE /spaces/:spaceId/members/:userId': {},
      'POST /spaces/:spaceId/desks/:deskKey/claim': {},
      'PUT /spaces/:spaceId/desks/:deskKey/decor': DECOR,
      'DELETE /spaces/:spaceId/desks/:deskKey': {},
      'POST /spaces/:spaceId/invites': {},
      'POST /spaces/:spaceId/map/validate': { map: TEST_MAP },
      'PUT /spaces/:spaceId/map': { map: TEST_MAP, baseVersion: 1 },
      'GET /spaces/:spaceId/map/export': undefined,
      'GET /spaces/:spaceId/replay': undefined,
    };

    it('toda rota /spaces/:spaceId/... responde 404 para quem não é membro', async () => {
      const routes = server.app.routeTable.filter((r) => r.url.startsWith('/spaces/:spaceId'));
      expect(routes.length).toBeGreaterThan(0);
      const keys = routes.map((r) => `${r.method} ${r.url}`);
      expect(keys.filter((k) => !(k in BODIES))).toEqual([]);

      const outsider = await loginGuest(server);
      const someone = await loginGuest(server);
      for (const { method, url } of routes) {
        const path = url
          .replace(':spaceId', otherSpaceId)
          .replace(':userId', someone.id)
          .replace(':deskKey', 'mesa-1');
        const result = await api(server, outsider, method, path, BODIES[`${method} ${url}`] ?? {});
        expect({ route: `${method} ${url}`, status: result.status }).toEqual({ route: `${method} ${url}`, status: 404 });
      }
    });
  });
});
