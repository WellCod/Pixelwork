import * as schema from '@pixelwork/shared/schema';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString });
  return { pool, db: drizzle(pool, { schema }) };
}

export type Db = ReturnType<typeof createDb>['db'];
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
