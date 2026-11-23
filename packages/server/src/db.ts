import * as schema from '@pixelwork/shared/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

/** Pool do pg e cliente Drizzle com o schema compartilhado; quem cria fecha o pool. */
export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof createDb>['db'];
/** Transação do Drizzle, para funções que rodam tanto dentro quanto fora de uma. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
