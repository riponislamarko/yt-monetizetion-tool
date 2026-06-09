import { lt } from "drizzle-orm";
import { createDb } from "./index.js";
import { toolLookups } from "./schema.js";

const RETENTION_DAYS = Number(process.env.LOOKUP_RETENTION_DAYS ?? 90);

/**
 * Deletes tool_lookups rows older than the retention window. Wire to a daily cron in prod.
 * Documented in README under Data Retention.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required to run the purge.");

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { db, close } = createDb(url, { max: 1 });
  const deleted = await db.delete(toolLookups).where(lt(toolLookups.createdAt, cutoff)).returning({
    id: toolLookups.id,
  });
  console.log(`Purged ${deleted.length} tool_lookups rows older than ${RETENTION_DAYS} days.`);
  await close();
}

main().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
