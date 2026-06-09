import type { Logger } from "pino";
import type { Redis } from "ioredis";
import { createDb, type Database } from "@yt/db";
import { type Env, loadEnv, youtubeApiKeys } from "./config/env.js";
import { createLogger } from "./lib/logger.js";
import { createRedis } from "./lib/redis.js";
import { CacheManager } from "./lib/cache.js";
import { PlaywrightPool } from "./lib/playwright.js";
import { YoutubeQuotaManager } from "./lib/youtube/quota-manager.js";
import { YoutubeDataApi } from "./lib/youtube/data-api.js";
import { initSentry, closeSentry } from "./lib/observability.js";

/**
 * The application dependency container. Built once at boot and threaded into routes/services.
 * Owns the lifecycle of every external connection so graceful shutdown (§6.5) can drain them.
 */
export interface AppContext {
  env: Env;
  log: Logger;
  redis: Redis;
  db: Database;
  dbClose: () => Promise<void>;
  cache: CacheManager;
  quota: YoutubeQuotaManager;
  dataApi: YoutubeDataApi;
  playwright: PlaywrightPool;
}

export function createContext(): AppContext {
  const env = loadEnv();
  const log = createLogger(env);
  initSentry(env, log); // Phase 2: no-op without SENTRY_DSN
  const redis = createRedis(env.REDIS_URL, log);
  const { db, close: dbClose } = createDb(env.DATABASE_URL);
  const cache = new CacheManager(redis, log);
  const keys = youtubeApiKeys(env);
  const quota = new YoutubeQuotaManager(keys, redis, log, db);
  const dataApi = new YoutubeDataApi(quota);
  const playwright = new PlaywrightPool(log);

  if (keys.length === 0) {
    log.info("No YouTube Data API keys configured — running on the scraping layer alone.");
  } else {
    log.info({ keyCount: keys.length }, "YouTube Data API enrichment enabled.");
  }

  return { env, log, redis, db, dbClose, cache, quota, dataApi, playwright };
}

export async function destroyContext(ctx: AppContext): Promise<void> {
  await closeSentry();
  await ctx.playwright.close().catch(() => undefined);
  await ctx.dbClose().catch(() => undefined);
  try {
    ctx.redis.disconnect();
  } catch {
    /* noop */
  }
}
