import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
let instance: DB | null = null;

function getDb(): DB {
  if (instance) return instance;
  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL is not configured.");
  const client = postgres(url, { prepare: false, max: 1, idle_timeout: 20 });
  instance = drizzle(client, { schema });
  return instance;
}

// Lazy proxy: the connection opens inside a request handler, never at module load.
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as any;
    const v = real[prop];
    return typeof v === "function" ? v.bind(real) : v;
  },
});

export * from "./schema";
