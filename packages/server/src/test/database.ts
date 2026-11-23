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
  // Nome aleatório: testes em paralelo (e outros processos) não dividem banco.
  const databaseName = `pixelwork_test_${randomBytes(6).toString('hex')}`;
  const adminClient = new pg.Client({ connectionString: adminUrl });
  await adminClient.connect();
  await adminClient.query(`create database ${databaseName}`);
  await adminClient.end();

  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  await runMigrations(databaseUrl.toString());

  return {
    url: databaseUrl.toString(),
    drop: async () => {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      // `with (force)` derruba conexões que o teste tenha deixado abertas.
      await client.query(`drop database if exists ${databaseName} with (force)`);
      await client.end();
    },
  };
}
