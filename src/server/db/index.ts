import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

type Cache = { pool?: Pool; db?: Database };
const globalCache = globalThis as typeof globalThis & { __teamReportsDb?: Cache };

/**
 * One connection pool per server process. The cache on globalThis stops the dev
 * server from opening a new pool every time it reloads a file.
 */
export function getDb(): Database {
  const cache = (globalCache.__teamReportsDb ??= {});
  if (cache.db) return cache.db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  cache.pool = new Pool({
    connectionString,
    // Serverless functions are short-lived; keep the pool small there.
    max: process.env.VERCEL ? 4 : 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  });
  cache.db = drizzle(cache.pool, { schema });
  return cache.db;
}

/** Closes the pool. Scripts call this so the process can exit. */
export async function closeDb(): Promise<void> {
  const cache = globalCache.__teamReportsDb;
  if (cache?.pool) await cache.pool.end();
  globalCache.__teamReportsDb = undefined;
}

export { schema };
