import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export * from "./schema.js";
export { sql, eq, and, lt, gt, desc } from "drizzle-orm";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * Create a Drizzle client over a postgres-js pool. The caller owns the lifecycle and
 * should call `close()` on graceful shutdown.
 */
export function createDb(connectionString: string, options?: { max?: number }) {
  const client = postgres(connectionString, {
    max: options?.max ?? 10,
    prepare: false, // Neon/pgbouncer friendly
  });
  const db = drizzle(client, { schema });
  return {
    db,
    client,
    close: () => client.end({ timeout: 5 }),
  };
}
