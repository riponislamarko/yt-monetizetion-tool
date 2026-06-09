import { describe, it, expect, vi } from "vitest";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { YoutubeQuotaManager } from "./quota-manager.js";
import { QuotaExhaustedError } from "@yt/validators/errors";

const log = { warn: vi.fn(), debug: vi.fn(), info: vi.fn() } as unknown as Logger;
const fixedClock = () => new Date("2026-06-08T10:00:00Z");

/** In-memory Redis counter store supporting the quota manager's call surface. */
function fakeRedis(initial: Record<string, number> = {}): Redis {
  const store = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async incrby(k: string, n: number) {
      const next = (Number(store.get(k)) || 0) + n;
      store.set(k, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
    async set(k: string, v: string) {
      store.set(k, v);
      return "OK";
    },
  } as unknown as Redis;
}

describe("YoutubeQuotaManager — disabled (zero keys)", () => {
  it("isEnabled() is false and execute throws QuotaExhaustedError", async () => {
    const q = new YoutubeQuotaManager([], fakeRedis(), log, null, fixedClock);
    expect(q.isEnabled()).toBe(false);
    await expect(q.execute(1, async () => "x")).rejects.toBeInstanceOf(QuotaExhaustedError);
  });
});

describe("YoutubeQuotaManager — round-robin", () => {
  it("rotates across keys on successive calls", async () => {
    const q = new YoutubeQuotaManager(["k1", "k2", "k3"], fakeRedis(), log, null, fixedClock);
    const seen: string[] = [];
    await q.execute(1, async (key) => seen.push(key));
    await q.execute(1, async (key) => seen.push(key));
    await q.execute(1, async (key) => seen.push(key));
    expect(seen).toEqual(["k1", "k2", "k3"]);
  });
});

describe("YoutubeQuotaManager — exhaustion", () => {
  it("throws QuotaExhaustedError when every key is over budget", async () => {
    // Seed both keys near the 9500 budget so a 100-unit request cannot fit.
    const redis = fakeRedis({ "quota:2026-06-08:1": 9450, "quota:2026-06-08:2": 9450 });
    const q = new YoutubeQuotaManager(["k1", "k2"], redis, log, null, fixedClock);
    await expect(q.execute(100, async () => "x")).rejects.toBeInstanceOf(QuotaExhaustedError);
  });

  it("retries on the next key when one reports a quota error", async () => {
    const q = new YoutubeQuotaManager(["k1", "k2"], fakeRedis(), log, null, fixedClock);
    const result = await q.execute(1, async (key) => {
      if (key === "k1") throw new Error("quotaExceeded");
      return "served-by-k2";
    });
    expect(result).toBe("served-by-k2");
  });

  it("propagates non-quota errors without retrying", async () => {
    const q = new YoutubeQuotaManager(["k1", "k2"], fakeRedis(), log, null, fixedClock);
    let calls = 0;
    await expect(
      q.execute(1, async () => {
        calls++;
        throw new Error("network blip");
      }),
    ).rejects.toThrow("network blip");
    expect(calls).toBe(1);
  });
});

describe("YoutubeQuotaManager — usage reporting", () => {
  it("reports per-key used/budget", async () => {
    const redis = fakeRedis({ "quota:2026-06-08:1": 500 });
    const q = new YoutubeQuotaManager(["k1", "k2"], redis, log, null, fixedClock);
    const usage = await q.getUsage();
    expect(usage).toEqual([
      { keyIndex: 1, used: 500, budget: 9500 },
      { keyIndex: 2, used: 0, budget: 9500 },
    ]);
  });
});
