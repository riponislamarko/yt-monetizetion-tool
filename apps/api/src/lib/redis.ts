import { Redis } from "ioredis";
import type { Logger } from "pino";

/**
 * Shared ioredis client. Used for the cache layer, rate-limit counters, and the quota
 * manager's live counters. Connection failures are NON-FATAL for the cache/quota paths —
 * those layers treat Redis errors as a miss (§6.2). Rate limiting falls back to in-process.
 *
 * `lazyConnect` keeps boot from hard-failing if Redis is momentarily down; the first command
 * triggers the connect. We cap retries so a permanently-down Redis doesn't spam reconnects.
 */
export function createRedis(url: string, log: Logger): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  let warned = false;
  client.on("error", (err) => {
    // Log once at warn — cache/quota degrade gracefully, so we don't want a flood.
    if (!warned) {
      log.warn({ err: err.message }, "Redis connection error — cache/quota running degraded");
      warned = true;
    }
  });
  client.on("ready", () => {
    warned = false;
    log.info("Redis connected");
  });

  return client;
}
