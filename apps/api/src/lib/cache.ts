import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type { Logger } from "pino";

/**
 * Redis cache layer (§6.2). Every method is FAIL-SOFT: on any Redis error we log once at
 * warn and behave as a cache miss — never throw to the caller. The app must run fully with
 * Redis down. Keys: `tool:{toolName}:{sha256(normalizedInputUrl)}`.
 */

export const TTL_BY_TOOL: Record<string, number> = {
  "monetization-checker": 1800,
  "channel-id-finder": 3600,
  "data-viewer": 1800,
  "image-tool": 86400,
  "tag-extractor": 3600,
  "money-calculator": 3600,
  "shadowban-detector": 900,
  "thumbnail-downloader": 86400,
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "feature",
  "si",
  "pp",
  "ab_channel",
]);

/**
 * Normalize a URL before hashing so equivalent inputs share a cache entry: lowercase host,
 * strip tracking params, drop fragments and trailing slashes. Non-URL inputs (bare IDs) are
 * lowercased and trimmed.
 */
export function normalizeInputUrl(input: string): string {
  const raw = input.trim();
  // Bare identifiers (no scheme, host, or path) normalize by lowercasing — don't coerce them
  // into URLs (`new URL("https://ABC")` would treat the id as a hostname).
  const looksLikeUrl = /^https?:\/\//i.test(raw) || raw.includes("/") || raw.includes(".");
  if (!looksLikeUrl) return raw.toLowerCase();
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) u.searchParams.delete(p);
    }
    u.pathname = u.pathname.replace(/\/+$/, "") || "/";
    return u.toString();
  } catch {
    return raw.toLowerCase();
  }
}

export function cacheKey(toolName: string, inputUrl: string): string {
  const hash = createHash("sha256").update(normalizeInputUrl(inputUrl)).digest("hex");
  return `tool:${toolName}:${hash}`;
}

export class CacheManager {
  private warned = false;

  constructor(
    private readonly redis: Redis,
    private readonly log: Logger,
  ) {}

  private onError(op: string, err: unknown): void {
    if (!this.warned) {
      this.log.warn({ op, err: (err as Error)?.message }, "Cache unavailable — running degraded");
      this.warned = true;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (err) {
      this.onError("get", err);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      this.onError("set", err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      this.onError("del", err);
    }
  }

  /**
   * Cache-aside with light stampede control: on a miss we take a short SET NX lock so that
   * under concurrent load only ONE caller runs `fn` and the rest briefly wait and re-read.
   * Returns `{ value, cached }`. If `fn` throws, the error propagates (nothing is cached).
   */
  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
  ): Promise<{ value: T; cached: boolean }> {
    const hit = await this.get<T>(key);
    if (hit !== null) return { value: hit, cached: true };

    const lockKey = `${key}:lock`;
    let gotLock = false;
    try {
      const res = await this.redis.set(lockKey, "1", "EX", 10, "NX");
      gotLock = res === "OK";
    } catch (err) {
      this.onError("lock", err);
    }

    if (!gotLock) {
      // Someone else is computing it; wait briefly then re-read once.
      await new Promise((r) => setTimeout(r, 250));
      const second = await this.get<T>(key);
      if (second !== null) return { value: second, cached: true };
      // Still nothing — compute ourselves rather than block the request.
    }

    try {
      const value = await fn();
      await this.set(key, value, ttlSeconds);
      return { value, cached: false };
    } finally {
      if (gotLock) await this.del(lockKey);
    }
  }
}
