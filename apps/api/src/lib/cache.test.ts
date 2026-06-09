import { describe, it, expect, vi } from "vitest";
import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { CacheManager, normalizeInputUrl, cacheKey } from "./cache.js";

const log = { warn: vi.fn(), debug: vi.fn(), info: vi.fn() } as unknown as Logger;

/** Minimal in-memory Redis good enough for the cache layer's call surface. */
function fakeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async set(k: string, v: string, ..._args: unknown[]) {
      const nx = _args.includes("NX");
      if (nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    async del(k: string) {
      store.delete(k);
      return 1;
    },
  } as unknown as Redis;
}

/** Redis that throws on every call — exercises the fail-soft path. */
function throwingRedis(): Redis {
  const boom = async () => {
    throw new Error("redis down");
  };
  return { get: boom, set: boom, del: boom } as unknown as Redis;
}

describe("normalizeInputUrl", () => {
  it("lowercases host, strips www and tracking params", () => {
    const a = normalizeInputUrl("https://WWW.YouTube.com/watch?v=abc&utm_source=x&si=y");
    expect(a).toContain("youtube.com");
    expect(a).not.toContain("utm_source");
    expect(a).not.toContain("si=");
  });
  it("treats bare ids stably", () => {
    expect(normalizeInputUrl("DQW4W9WGXCQ")).toBe("dqw4w9wgxcq");
  });
});

describe("cacheKey", () => {
  it("is stable for equivalent URLs", () => {
    const a = cacheKey("t", "https://youtube.com/watch?v=abc&utm_source=x");
    const b = cacheKey("t", "https://www.youtube.com/watch?v=abc");
    expect(a).toBe(b);
  });
});

describe("CacheManager", () => {
  it("get/set round-trips JSON", async () => {
    const c = new CacheManager(fakeRedis(), log);
    await c.set("k", { a: 1 }, 60);
    expect(await c.get("k")).toEqual({ a: 1 });
  });

  it("getOrSet computes on miss then serves cached", async () => {
    const c = new CacheManager(fakeRedis(), log);
    const fn = vi.fn(async () => ({ v: 42 }));
    const first = await c.getOrSet("k", 60, fn);
    expect(first).toEqual({ value: { v: 42 }, cached: false });
    const second = await c.getOrSet("k", 60, fn);
    expect(second).toEqual({ value: { v: 42 }, cached: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is fail-soft: Redis errors behave as a miss, never throw", async () => {
    const c = new CacheManager(throwingRedis(), log);
    expect(await c.get("k")).toBeNull();
    await expect(c.set("k", 1, 60)).resolves.toBeUndefined();
    const fn = vi.fn(async () => "computed");
    const res = await c.getOrSet("k", 60, fn);
    expect(res).toEqual({ value: "computed", cached: false });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
