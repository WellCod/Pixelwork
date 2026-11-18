import { buildApp } from './app.ts';
import { configFromEnv } from './config.ts';
import { createDb } from './db.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const { pool, db } = createDb(env.DATABASE_URL);
const app = buildApp({ db, config: configFromEnv(env), logger: true });

async function shutdown(): Promise<void> {
  await app.close();
  await pool.end();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown().then(() => process.exit(0));
  });
}

await app.listen({ port: env.PORT, host: '127.0.0.1' });
