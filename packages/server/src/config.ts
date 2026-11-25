import type { Env } from './env.ts';
import type { LiveKitConfig } from './realtime/media.ts';

/** O que o app precisa do ambiente; os testes montam isto sem `.env`. */
export interface AppConfig {
  publicUrl: string;
  cookieSecure: boolean;
  demoSpaceSlug: string;
  livekit: LiveKitConfig;
  /** Vazio desliga o login pelo GitHub. */
  github: { clientId: string; clientSecret: string };
  /** Confia no X-Forwarded-For (atrás do Caddy em produção). */
  trustProxy: boolean;
  receptionistEnabled?: boolean;
  receptionistLimits?: { sessions: number; durationMs: number };
}

export function configFromEnv(env: Env): AppConfig {
  return {
    publicUrl: env.PUBLIC_URL,
    cookieSecure: env.SESSION_COOKIE_SECURE,
    demoSpaceSlug: env.DEMO_SPACE_SLUG,
    livekit: {
      url: env.LIVEKIT_URL,
      apiUrl: env.LIVEKIT_API_URL ?? env.LIVEKIT_URL,
      apiKey: env.LIVEKIT_API_KEY,
      apiSecret: env.LIVEKIT_API_SECRET,
    },
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
    trustProxy: env.TRUST_PROXY,
    receptionistEnabled: env.RECEPTIONIST_ENABLED,
    receptionistLimits: { sessions: env.RECEPTIONIST_MAX_SESSIONS, durationMs: env.RECEPTIONIST_DURATION_SECONDS * 1000 },
  };
}
