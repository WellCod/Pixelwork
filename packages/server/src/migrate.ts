import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './db.ts';

export const migrationsFolder = join(import.meta.dirname, '../drizzle');

export async function runMigrations(connectionString: string): Promise<void> {
  const { pool, db } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  await runMigrations(url);
  console.log('migrations aplicadas');
}
