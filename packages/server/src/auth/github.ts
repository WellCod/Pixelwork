import { randomBytes, timingSafeEqual } from 'node:crypto';
import { randomAvatar } from '@pixelwork/shared';
import { oauthAccounts, spaceMembers, users } from '@pixelwork/shared/schema';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { parseCookies, serializeCookie } from '../cookies.ts';
import { findDemoSpaceId } from '../demo.ts';
import { uuidv7 } from '../ids.ts';
import type { AuthDeps } from './routes.ts';
import { ACCOUNT_SESSION_MS, SESSION_COOKIE, createSession } from './sessions.ts';

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
}

/** O que o callback precisa do GitHub; os testes trocam por um dublê. */
export interface GitHubClient {
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  user(accessToken: string): Promise<GitHubUser>;
}

export function githubClient(clientId: string, clientSecret: string): GitHubClient {
  return {
    exchangeCode: async (code, redirectUri) => {
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      });
      const body = (await response.json()) as { access_token?: string; error?: string };
      if (!response.ok || !body.access_token) throw new Error(`github: troca de código falhou (${body.error ?? response.status})`);
      return body.access_token;
    },
    user: async (accessToken) => {
      const response = await fetch('https://api.github.com/user', {
        headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${accessToken}`, 'user-agent': 'pixelwork' },
      });
      if (!response.ok) throw new Error(`github: /user respondeu ${response.status}`);
      const body = (await response.json()) as GitHubUser;
      return { id: body.id, login: body.login, name: body.name };
    },
  };
}

const STATE_COOKIE = 'oauth_state';
const STATE_PATH = '/auth/github';
const STATE_TTL_SECONDS = 600;
const PROVIDER = 'github';

function sameState(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function registerGitHubRoutes(app: FastifyInstance, deps: AuthDeps & { github: GitHubClient }): void {
  const { db, config, clock, github } = deps;
  const enabled = config.github.clientId !== '' && config.github.clientSecret !== '';
  const redirectUri = `${new URL(config.publicUrl).origin}/auth/github/callback`;
  const stateCookie = (value: string, maxAgeSeconds: number) =>
    serializeCookie(STATE_COOKIE, value, { maxAgeSeconds, secure: config.cookieSecure, path: STATE_PATH });

  app.get('/auth/providers', () => ({ github: enabled }));

  app.get('/auth/github', async (_request, reply) => {
    if (!enabled) return reply.code(503).send({ error: 'github_not_configured' });
    const state = randomBytes(24).toString('base64url');
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', config.github.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'read:user');
    url.searchParams.set('state', state);
    return reply.header('set-cookie', stateCookie(state, STATE_TTL_SECONDS)).redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string } }>('/auth/github/callback', async (request, reply) => {
    const expected = parseCookies(request.headers.cookie)[STATE_COOKIE];
    void reply.header('set-cookie', stateCookie('', 0));
    // Sem o state do cookie, o callback pode ter sido disparado por outro site (login CSRF).
    if (!enabled || !sameState(request.query.state, expected) || !request.query.code) {
      return reply.redirect('/?erro=github');
    }

    let profile: GitHubUser;
    try {
      profile = await github.user(await github.exchangeCode(request.query.code, redirectUri));
    } catch (error) {
      request.log.error(error, 'login pelo github falhou');
      return reply.redirect('/?erro=github');
    }

    const providerUserId = String(profile.id);
    const now = clock.now();
    const token = await db.transaction(async (tx) => {
      const linked = await tx
        .select({ userId: oauthAccounts.userId })
        .from(oauthAccounts)
        .where(and(eq(oauthAccounts.provider, PROVIDER), eq(oauthAccounts.providerUserId, providerUserId)));
      let userId = linked[0]?.userId;
      if (!userId) {
        userId = uuidv7(now);
        const displayName = Array.from((profile.name ?? '').trim() || profile.login).slice(0, 40).join('');
        await tx.insert(users).values({ id: userId, displayName, avatar: randomAvatar(), isGuest: false });
        await tx.insert(oauthAccounts).values({ provider: PROVIDER, providerUserId, userId });
        // Conta nova começa no coworking de demonstração, como o convidado.
        const demo = await findDemoSpaceId(tx, config.demoSpaceSlug);
        if (demo) await tx.insert(spaceMembers).values({ spaceId: demo, userId, role: 'member' }).onConflictDoNothing();
      }
      return createSession(tx, userId, new Date(now + ACCOUNT_SESSION_MS));
    });

    return reply
      .header('set-cookie', [
        stateCookie('', 0),
        serializeCookie(SESSION_COOKIE, token, { maxAgeSeconds: ACCOUNT_SESSION_MS / 1000, secure: config.cookieSecure }),
      ])
      .redirect('/');
  });
}
