import { buildApp } from './app.ts';
import { configFromEnv } from './config.ts';
import { createDb } from './db.ts';
import { loadEnv } from './env.ts';
import { scheduleJobs } from './jobs.ts';
import { systemClock } from './realtime/clock.ts';

const env = loadEnv();
const { pool, db } = createDb(env.DATABASE_URL);
const app = buildApp({ db, config: configFromEnv(env), logger: !env.LOAD_TEST });

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
