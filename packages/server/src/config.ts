import type { Env } from './env.ts';

/** O que o app precisa do ambiente; os testes montam isto sem `.env`. */
export interface AppConfig {
  publicUrl: string;
  cookieSecure: boolean;
  demoSpaceSlug: string;
}

export function configFromEnv(env: Env): AppConfig {
  return {
    publicUrl: env.PUBLIC_URL,
    cookieSecure: env.SESSION_COOKIE_SECURE,
    demoSpaceSlug: env.DEMO_SPACE_SLUG,
  };
}
