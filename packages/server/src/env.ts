import { z } from 'zod';

/** Booleano vindo de variável de ambiente: só aceita os textos `true` e `false`. */
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
  TRUST_PROXY: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RECEPTIONIST_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  RECEPTIONIST_PYTHON: z.string().default(''),
  RECEPTIONIST_LOCAL_MODELS_DIR: z.string().default(''),
  RECEPTIONIST_LOCAL_LLM_URL: z.union([z.literal(''), z.string().regex(/^http:\/\/127\.0\.0\.1:\d{1,5}\/?$/)]).default(''),
  RECEPTIONIST_MAX_SESSIONS: z.coerce.number().int().min(1).max(8).default(2),
  RECEPTIONIST_DURATION_SECONDS: z.coerce.number().int().min(15).max(300).default(120),
  RECEPTIONIST_DAILY_SECONDS: z.coerce.number().int().min(15).max(86400).default(3600),
  // Liga /internal/stats para o teste de carga. Nunca em produção.
  LOAD_TEST: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
});

/**
 * Endereço que só existe dentro da máquina ou da rede local: localhost, IPv4 privado (10/8,
 * 172.16/12, 192.168/16) e nomes `.local`. Https nele é o modo de rede local do desenvolvimento.
 */
export function isLocalHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '127.0.0.1') return true;
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [first = 0, second = 0] = octets;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

/**
 * Com PUBLIC_URL em https num endereço público é produção: valores de desenvolvimento não sobem.
 * Https em localhost ou na rede local é desenvolvimento (câmera e microfone exigem https fora do
 * localhost), então as chaves de dev continuam valendo.
 */
const Env = BaseEnv.superRefine((env, context) => {
  if (env.RECEPTIONIST_ENABLED && Boolean(env.RECEPTIONIST_LOCAL_MODELS_DIR) !== Boolean(env.RECEPTIONIST_LOCAL_LLM_URL)) {
    context.addIssue({ code: 'custom', path: ['RECEPTIONIST_LOCAL_LLM_URL'], message: 'configure o diretório de modelos e a URL local juntos' });
  }
  if (!env.PUBLIC_URL.startsWith('https://')) return;
  if (isLocalHost(new URL(env.PUBLIC_URL).hostname)) return;
  const issue = (path: string, message: string) => context.addIssue({ code: 'custom', path: [path], message });
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

/** Valida o ambiente e falha no boot com a lista de todos os problemas de uma vez. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`variáveis de ambiente inválidas:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
