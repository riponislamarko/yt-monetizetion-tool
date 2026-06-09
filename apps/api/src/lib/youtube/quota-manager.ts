import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { QuotaExhaustedError } from "@yt/validators/errors";
import type { Database } from "@yt/db";
import { apiQuotaUsage, sql } from "@yt/db";

/**
 * YouTube Data API quota manager (§6.1). Only relevant when ≥1 Data API key is configured;
 * with zero keys `isEnabled()` is false and every enrichment caller skips the Data API path.
 *
 * Strategy: reserve-then-spend. We INCREMENT the per-key Redis counter BEFORE the call so
 * concurrent requests can't both believe budget remains. On a quotaExceeded error we mark
 * that key exhausted for the day and retry the next key. Redis holds the live counter; the
 * api_quota_usage table is the durable daily rollup (write-through upsert per increment).
 */

const DAILY_BUDGET = 9500; // buffer under the 10000 hard limit
const EXHAUSTED = 1_000_000; // sentinel pushed into a key's counter to retire it for the day

export interface QuotaUsage {
  keyIndex: number;
  used: number;
  budget: number;
}

/** UTC day key + seconds-until-end-of-day for TTL. Date is injected for testability. */
function utcDayInfo(now: Date): { day: string; ttl: number } {
  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const endOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  const ttl = Math.max(60, Math.ceil((endOfDay - now.getTime()) / 1000));
  return { day, ttl };
}

function isQuotaError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("quotaexceeded") ||
    msg.includes("dailylimitexceeded") ||
    msg.includes("quota exceeded") ||
    msg.includes("ratelimitexceeded")
  );
}

export class YoutubeQuotaManager {
  private rr = 0; // round-robin cursor

  constructor(
    private readonly keys: string[],
    private readonly redis: Redis,
    private readonly log: Logger,
    private readonly db: Database | null,
    /** Injectable clock so tests are deterministic; defaults to wall clock. */
    private readonly clock: () => Date = () => new Date(),
  ) {}

  isEnabled(): boolean {
    return this.keys.length > 0;
  }

  private counterKey(day: string, keyIndex: number): string {
    return `quota:${day}:${keyIndex}`;
  }

  private async readUsed(day: string, keyIndex: number): Promise<number> {
    try {
      const v = await this.redis.get(this.counterKey(day, keyIndex));
      return v ? Number(v) : 0;
    } catch (err) {
      // Redis down → assume zero used (conservative toward availability, not over-spend
      // protection). Quota errors from the API itself remain the hard backstop.
      this.log.debug({ err: (err as Error)?.message }, "quota readUsed failed");
      return 0;
    }
  }

  private async reserve(day: string, keyIndex: number, units: number, ttl: number): Promise<number> {
    const key = this.counterKey(day, keyIndex);
    const next = await this.redis.incrby(key, units);
    await this.redis.expire(key, ttl);
    return next;
  }

  private async release(day: string, keyIndex: number, units: number): Promise<void> {
    try {
      await this.redis.incrby(this.counterKey(day, keyIndex), -units);
    } catch {
      /* non-fatal */
    }
  }

  private async markExhausted(day: string, keyIndex: number, ttl: number): Promise<void> {
    try {
      await this.redis.set(this.counterKey(day, keyIndex), String(EXHAUSTED), "EX", ttl);
    } catch {
      /* non-fatal */
    }
  }

  /** Durable write-through rollup into api_quota_usage (§5). DB failure is non-fatal. */
  private async rollup(day: string, keyIndex: number, units: number): Promise<void> {
    if (!this.db) return;
    try {
      await this.db
        .insert(apiQuotaUsage)
        .values({ apiKeyIndex: keyIndex, unitsUsed: units, date: day })
        .onConflictDoUpdate({
          target: [apiQuotaUsage.apiKeyIndex, apiQuotaUsage.date],
          set: {
            unitsUsed: sql`${apiQuotaUsage.unitsUsed} + ${units}`,
            updatedAt: sql`now()`,
          },
        });
    } catch (err) {
      this.log.debug({ err: (err as Error)?.message }, "quota rollup upsert failed");
    }
  }

  /**
   * Pick the next round-robin key whose projected usage + `units` ≤ budget, reserve the
   * units, run `fn`, and on quotaExceeded retire the key and try the next. Throws
   * QuotaExhaustedError if no key can satisfy the request.
   */
  async execute<T>(units: number, fn: (apiKey: string) => Promise<T>): Promise<T> {
    if (!this.isEnabled()) {
      throw new QuotaExhaustedError("No YouTube Data API keys configured.");
    }
    const { day, ttl } = utcDayInfo(this.clock());
    const n = this.keys.length;

    for (let attempt = 0; attempt < n; attempt++) {
      const keyIndex = (this.rr % n) + 1; // 1-based index
      this.rr = (this.rr + 1) % n;
      const apiKey = this.keys[keyIndex - 1]!;

      const used = await this.readUsed(day, keyIndex);
      if (used + units > DAILY_BUDGET) continue;

      // Reserve-then-spend.
      let reserved = used + units;
      try {
        reserved = await this.reserve(day, keyIndex, units, ttl);
      } catch (err) {
        this.log.debug({ err: (err as Error)?.message }, "quota reserve failed (Redis) — spending anyway");
      }
      if (reserved > DAILY_BUDGET) {
        // Lost a race; back the reservation out and try the next key.
        await this.release(day, keyIndex, units);
        continue;
      }

      void this.rollup(day, keyIndex, units);

      try {
        return await fn(apiKey);
      } catch (err) {
        if (isQuotaError(err)) {
          this.log.warn({ keyIndex }, "Data API key hit quota — retiring for the day");
          await this.markExhausted(day, keyIndex, ttl);
          continue; // retry on the next key
        }
        // Non-quota failure: units stay spent (conservative). Surface the error.
        this.log.debug({ keyIndex, err: (err as Error)?.message }, "Data API call failed (non-quota)");
        throw err;
      }
    }

    throw new QuotaExhaustedError();
  }

  async getUsage(): Promise<QuotaUsage[]> {
    const { day } = utcDayInfo(this.clock());
    const out: QuotaUsage[] = [];
    for (let i = 1; i <= this.keys.length; i++) {
      out.push({ keyIndex: i, used: await this.readUsed(day, i), budget: DAILY_BUDGET });
    }
    return out;
  }
}
