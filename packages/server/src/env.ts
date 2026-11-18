import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const Env = z.object({
  DATABASE_URL: z.url(),
  PUBLIC_URL: z.url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LIVEKIT_URL: z.url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // Só usados a partir da fase 5 (GitHub OAuth).
  GITHUB_CLIENT_ID: z.string().default(''),
  GITHUB_CLIENT_SECRET: z.string().default(''),
  SESSION_COOKIE_SECURE: flag,
  DEMO_SPACE_SLUG: z.string().regex(/^[a-z0-9-]{1,40}$/),
  // 0.0.0.0 dentro do container; em dev, só a máquina local.
  HOST: z.string().default('127.0.0.1'),
  // Liga /internal/stats para o teste de carga. Nunca em produção.
  LOAD_TEST: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
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
