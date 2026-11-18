import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { runMigrations } from '../migrate.ts';

const adminUrl = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/coworking';

export interface TestDatabase {
  url: string;
  drop: () => Promise<void>;
}

/** Banco novo e migrado por execução, apagado no fim (docs/architecture.md, seção 14). */
export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `pixelwork_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  await runMigrations(url.toString());

  return {
    url: url.toString(),
    drop: async () => {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      await client.query(`drop database if exists ${name} with (force)`);
      await client.end();
    },
  };
}
