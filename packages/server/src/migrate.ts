import { join } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './db.ts';

export const migrationsFolder = join(import.meta.dirname, '../drizzle');

/** Aplica as migrations pendentes da pasta drizzle/ com um pool próprio, fechado no fim. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { pool, db } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await pool.end();
  }
}

// Rodando direto (`node migrate.ts`): não passa pelo loadEnv, só precisa do banco.
if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL não definida');
  await runMigrations(databaseUrl);
  console.log('migrations aplicadas');
}
