import { createDb } from './db.ts';
import { loadDemoTemplate, seedDemo } from './demo.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const { pool, db } = createDb(env.DATABASE_URL);
try {
  const spaceId = await seedDemo(db, env.DEMO_SPACE_SLUG, loadDemoTemplate());
  console.log(`coworking de demo pronto: ${env.DEMO_SPACE_SLUG} (${spaceId})`);
} finally {
  await pool.end();
}
