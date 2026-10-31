import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import * as schema from "./schema";

// Queries are built by Drizzle and executed through a service-role-only database
// function (public.app_sql) over HTTPS, because the server runtime has no direct
// Postgres connection. Transaction control statements are no-ops here.
type DB = PgRemoteDatabase<typeof schema>;

const toParam = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return `{${value.map((item) => `"${String(item).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
  }
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
};

const TX_CONTROL = /^\s*(begin|commit|rollback|savepoint|release|set\s+transaction|start\s+transaction)\b/i;

async function run(sql: string, params: unknown[]) {
  if (TX_CONTROL.test(sql)) return [] as unknown[][];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.rpc as any)("app_sql", { q: sql, params: params.map(toParam) });
  if (error) {
    console.error("Database query failed", error.message, sql);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown[][];
}

const base: DB = drizzle(
  async (sql, params, method) => {
    const rows = await run(sql, params);
    return { rows: method === "get" ? (rows[0] as any) : rows };
  },
  { schema },
);

// The proxy driver has no transactions; run the callback against the same
// database handle so the original handlers keep working (statements are not atomic).
(base as any).transaction = async (fn: (tx: any) => Promise<unknown>) => {
  const tx = Object.create(base);
  tx.rollback = () => {
    throw new Error("Transaction rolled back");
  };
  return fn(tx);
};

export const db: DB = base;

export * from "./schema";
