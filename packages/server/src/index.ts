import { buildApp } from './app.ts';
import { configFromEnv } from './config.ts';
import { createDb } from './db.ts';
import { loadEnv } from './env.ts';
import { scheduleJobs } from './jobs.ts';
import { systemClock } from './realtime/clock.ts';
import { LocalReceptionWorker } from './realtime/reception-worker.ts';

const env = loadEnv();
const { pool, db } = createDb(env.DATABASE_URL);
// O teste de carga cria dezenas de convidados do mesmo IP; LOAD_TEST nunca sobe em produção (env.ts).
const rtcUrl = new URL(env.LIVEKIT_API_URL ?? env.LIVEKIT_URL);
if (rtcUrl.protocol === 'http:') rtcUrl.protocol = 'ws:';
if (rtcUrl.protocol === 'https:') rtcUrl.protocol = 'wss:';
const receptionVoice = env.RECEPTIONIST_ENABLED && env.RECEPTIONIST_PYTHON
  ? new LocalReceptionWorker(env.RECEPTIONIST_PYTHON, rtcUrl.href, (usage) => {
    process.stdout.write(JSON.stringify({ event: 'reception.usage', ...usage }) + '\n');
  }) : null;
const app = buildApp({
  db, config: configFromEnv(env), logger: !env.LOAD_TEST, rateLimit: !env.LOAD_TEST,
  ...(receptionVoice ? { receptionVoice } : {}),
});

if (env.LOAD_TEST) {
  // CPU e memória do processo para o relatório de `pnpm load`; só existe neste modo.
  app.get('/internal/stats', () => ({
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
    uptimeMs: Math.round(process.uptime() * 1000),
  }));
}

const jobs = scheduleJobs({
  db,
  clock: systemClock,
  scheduler: systemClock,
  gateway: app.realtime,
  demoSpaceSlug: env.DEMO_SPACE_SLUG,
  log: app.log,
});

async function shutdown(): Promise<void> {
  jobs.stop();
  await app.close();
  await pool.end();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0));
  });
}

await app.listen({ port: env.PORT, host: env.HOST });
