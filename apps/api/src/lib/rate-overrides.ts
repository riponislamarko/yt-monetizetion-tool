import type { Redis } from "ioredis";

/**
 * Per-IP rate-limit overrides (Phase 2, §5/§6.3). The durable record lives in the
 * rate_limit_overrides table; the LIVE value the limiter reads is mirrored into Redis for a
 * fast, fail-soft lookup on every request. The override numeric value is applied as the
 * per-window `max` for that IP (raising/lowering the default cap for trusted/abusive IPs).
 */

const overrideKey = (ipHash: string) => `rl:override:${ipHash}`;

/** Read an IP's override limit, or null. Fail-soft: Redis errors → null (default cap applies). */
export async function getOverrideLimit(redis: Redis, ipHash: string): Promise<number | null> {
  try {
    const v = await redis.get(overrideKey(ipHash));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export async function setOverrideLimit(
  redis: Redis,
  ipHash: string,
  limit: number,
  ttlSeconds: number,
): Promise<void> {
  await redis.set(overrideKey(ipHash), String(limit), "EX", Math.max(1, ttlSeconds));
}

export async function clearOverrideLimit(redis: Redis, ipHash: string): Promise<void> {
  await redis.del(overrideKey(ipHash));
}
