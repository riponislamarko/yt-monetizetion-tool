import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Audit log of every tool lookup. Stores only public URLs and a salted IP hash — no PII.
 * Subject to the 90-day retention purge (see purge.ts).
 */
export const toolLookups = pgTable(
  "tool_lookups",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    toolName: varchar("tool_name", { length: 64 }).notNull(),
    inputUrl: text("input_url").notNull(),
    result: jsonb("result").notNull(),
    cached: boolean("cached").notNull().default(false),
    signalSource: varchar("signal_source", { length: 16 }),
    ipHash: varchar("ip_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    toolCreatedIdx: index("tool_lookups_tool_created_idx").on(t.toolName, t.createdAt),
    ipCreatedIdx: index("tool_lookups_ip_created_idx").on(t.ipHash, t.createdAt),
  }),
);

/**
 * Durable daily rollup of YouTube Data API quota usage per key index. One row per
 * (api_key_index, date), upserted atomically. Redis holds the live counter (§6.1).
 */
export const apiQuotaUsage = pgTable(
  "api_quota_usage",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    apiKeyIndex: integer("api_key_index").notNull(),
    unitsUsed: integer("units_used").notNull().default(0),
    date: date("date").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    keyDateUnique: uniqueIndex("api_quota_usage_key_date_unique").on(t.apiKeyIndex, t.date),
  }),
);

/**
 * Phase 2: per-IP rate-limit overrides. Requires an authenticated admin route to manage
 * (see §6.3). Defined now so migrations are stable, unused until Phase 2.
 */
export const rateLimitOverrides = pgTable("rate_limit_overrides", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ipHash: varchar("ip_hash", { length: 64 }).notNull(),
  dailyLimit: integer("daily_limit").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type ToolLookup = typeof toolLookups.$inferSelect;
export type NewToolLookup = typeof toolLookups.$inferInsert;
export type ApiQuotaUsage = typeof apiQuotaUsage.$inferSelect;
export type RateLimitOverride = typeof rateLimitOverrides.$inferSelect;
