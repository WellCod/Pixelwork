import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const DEV_LIVEKIT_KEY = 'devkey';
const DEV_LIVEKIT_SECRET = 'secret';
const PLACEHOLDER_PASSWORD = 'troque-esta-senha';

const BaseEnv = z.object({
  DATABASE_URL: z.url(),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LIVEKIT_URL: z.url(),
  // Endereço da API do LiveKit visto pelo servidor; sem ele, usa LIVEKIT_URL. Em produção é a rede
  // interna do compose, sem dar a volta pelo Caddy e pelo domínio público.
  LIVEKIT_API_URL: z.url().optional(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // Só usados a partir da fase 5 (GitHub OAuth).
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  SESSION_COOKIE_SECURE: flag,
  DEMO_SPACE_SLUG: z.string().regex(/^[a-z0-9-]{1,40}$/),
  // 0.0.0.0 dentro do container; em dev, só a máquina local.
  HOST: z.string().default('127.0.0.1'),
  // true atrás de proxy reverso (Caddy em produção).
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  // Liga /internal/stats para o teste de carga. Nunca em produção.
  LOAD_TEST: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

/** Com PUBLIC_URL em https é produção: valores de desenvolvimento não sobem. */
const Env = BaseEnv.superRefine((env, ctx) => {
  if (!env.PUBLIC_URL.startsWith('https://')) return;
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (env.LIVEKIT_API_KEY === DEV_LIVEKIT_KEY) issue('LIVEKIT_API_KEY', 'chave de desenvolvimento em produção');
  if (env.LIVEKIT_API_SECRET === DEV_LIVEKIT_SECRET || env.LIVEKIT_API_SECRET.length < 32) {
    issue('LIVEKIT_API_SECRET', 'segredo de desenvolvimento ou curto demais (mínimo 32 caracteres)');
  }
  if (!env.SESSION_COOKIE_SECURE) issue('SESSION_COOKIE_SECURE', 'precisa ser true com https');
  if (env.LOAD_TEST) issue('LOAD_TEST', 'nunca em produção');
  const password = decodeURIComponent(new URL(env.DATABASE_URL).password);
  if (password === PLACEHOLDER_PASSWORD || password.length < 12) {
    issue('DATABASE_URL', 'senha do Postgres de exemplo ou curta demais (mínimo 12 caracteres)');
  }
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`);
    throw new Error(`variáveis de ambiente inválidas:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
