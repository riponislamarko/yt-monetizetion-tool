import type { Redis } from "ioredis";
import type { Logger } from "pino";
import { CacheManager } from "../lib/cache.js";
import { PlaywrightPool } from "../lib/playwright.js";
import { YoutubeQuotaManager } from "../lib/youtube/quota-manager.js";
import { YoutubeDataApi } from "../lib/youtube/data-api.js";
import type { AppContext } from "../context.js";
import type { Env } from "../config/env.js";

export const silentLog = {
  warn() {},
  debug() {},
  info() {},
  error() {},
  fatal() {},
  trace() {},
  child() {
    return silentLog;
  },
} as unknown as Logger;

/** In-memory Redis covering the cache + quota call surface used in integration tests. */
export function memoryRedis(): Redis {
  const store = new Map<string, string>();
  return {
    async get(k: string) {
      return store.get(k) ?? null;
    },
    async set(k: string, v: string, ...args: unknown[]) {
      if (args.includes("NX") && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    async del(k: string) {
      return store.delete(k) ? 1 : 0;
    },
    async incrby(k: string, n: number) {
      const next = (Number(store.get(k)) || 0) + n;
      store.set(k, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
    async ping() {
      return "PONG";
    },
    connect: async () => undefined,
    disconnect: () => undefined,
  } as unknown as Redis;
}

/** Fake Drizzle db: inserts/selects/deletes resolve to empty results. No real DB. */
export function fakeDb() {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: async () => [] as unknown[],
  };
  return {
    insert: () => ({ values: async () => undefined }),
    select: () => selectChain,
    delete: () => ({ where: async () => undefined }),
    execute: async () => [{ "?column?": 1 }],
  } as unknown as AppContext["db"];
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 3001,
    DATABASE_URL: "postgresql://test",
    REDIS_URL: "redis://test",
    CORS_ORIGIN: "http://localhost:3000",
    IP_HASH_SALT: "test-salt",
    RATE_LIMIT_MAX: 1000,
    RATE_LIMIT_WINDOW: "1 minute",
    LOG_LEVEL: "silent",
    ...overrides,
  } as Env;
}

/**
 * Build a test AppContext with fakes. Defaults to ZERO Data API keys (scraping-only path).
 * Pass `keys` to exercise the enrichment path, and `seedQuota` to pre-fill a key's Redis
 * counter (e.g. to force QuotaExhaustedError). A fixed clock keeps quota day-keys stable.
 */
export function makeTestContext(
  envOverrides: Partial<Env> = {},
  opts: { keys?: string[]; seedQuota?: Record<string, number> } = {},
): AppContext {
  const env = testEnv(envOverrides);
  const redis = memoryRedis();
  for (const [k, v] of Object.entries(opts.seedQuota ?? {})) {
    void redis.set(k, String(v));
  }
  const cache = new CacheManager(redis, silentLog);
  const clock = () => new Date("2026-06-08T10:00:00Z");
  const quota = new YoutubeQuotaManager(opts.keys ?? [], redis, silentLog, null, clock);
  const dataApi = new YoutubeDataApi(quota);
  const playwright = new PlaywrightPool(silentLog);
  return {
    env,
    log: silentLog,
    redis,
    db: fakeDb(),
    dbClose: async () => undefined,
    cache,
    quota,
    dataApi,
    playwright,
  };
}

/* ----------------------------- canned YouTube responses ----------------------------- */

export function channelHtml(opts: {
  channelId: string;
  title: string;
  subs?: string;
  videos?: string;
  country?: string;
  join?: boolean;
}): string {
  const data = {
    metadata: {
      channelMetadataRenderer: {
        title: opts.title,
        externalId: opts.channelId,
        description: "A test channel.",
        country: opts.country ?? "US",
        keywords: '"web development" javascript "react js"',
        isFamilySafe: true,
        avatar: { thumbnails: [{ url: "https://yt3.ggpht.com/avatar=s400", width: 400, height: 400 }] },
      },
    },
    header: {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  {
                    metadataParts: [
                      { text: { content: opts.subs ?? "1.2M subscribers" } },
                      { text: { content: opts.videos ?? "350 videos" } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
    ...(opts.join ? { joinButtonMarker: { joinButton: {} } } : {}),
  };
  return `<!doctype html><html><head><meta name="keywords" content="test,channel"></head><body><script>var ytInitialData = ${JSON.stringify(
    data,
  )};</script></body></html>`;
}

export function watchHtml(opts: { videoId: string; title: string; channelId: string; author: string }): string {
  const player = {
    videoDetails: {
      videoId: opts.videoId,
      title: opts.title,
      lengthSeconds: "212",
      viewCount: "1500000",
      channelId: opts.channelId,
      author: opts.author,
      keywords: ["test tag", "second tag"],
    },
  };
  const data = { contents: {} };
  return `<!doctype html><html><body><script>var ytInitialData = ${JSON.stringify(
    data,
  )};</script><script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script></body></html>`;
}

export function playerJson(opts: { videoId: string; title: string; channelId: string; withAds: boolean }) {
  return {
    videoDetails: {
      videoId: opts.videoId,
      title: opts.title,
      lengthSeconds: "212",
      viewCount: "1500000",
      channelId: opts.channelId,
    },
    ...(opts.withAds
      ? {
          adPlacements: [
            {
              adPlacementRenderer: {
                config: { adPlacementConfig: { kind: "AD_PLACEMENT_KIND_START" } },
                renderer: { adBreakServiceRenderer: { adBreakTimeSeconds: 0 } },
              },
            },
          ],
          playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
        }
      : {}),
  };
}

export function browseJson(channelId: string) {
  return { contents: {}, metadata: { channelMetadataRenderer: { externalId: channelId, isFamilySafe: true } } };
}

/* ----------------------------- canned Data API v3 responses ----------------------------- */

export function dataApiChannelResponse(opts: {
  channelId: string;
  title: string;
  handle?: string;
  subs?: number;
  videos?: number;
  views?: number;
  country?: string;
}) {
  return {
    items: [
      {
        id: opts.channelId,
        snippet: {
          title: opts.title,
          description: "Enriched via Data API.",
          customUrl: opts.handle ?? "@testchannel",
          publishedAt: "2015-01-01T00:00:00Z",
          country: opts.country ?? "US",
          thumbnails: { high: { url: "https://yt3.ggpht.com/api-avatar=s800" } },
        },
        statistics: {
          subscriberCount: String(opts.subs ?? 1_200_000),
          videoCount: String(opts.videos ?? 350),
          viewCount: String(opts.views ?? 500_000_000),
          hiddenSubscriberCount: false,
        },
        brandingSettings: {
          channel: { keywords: '"data api" enrichment "from google"' },
          image: { bannerExternalUrl: "https://yt3.ggpht.com/api-banner" },
        },
        topicDetails: { topicCategories: ["https://en.wikipedia.org/wiki/Technology"] },
        status: { madeForKids: false },
      },
    ],
  };
}

export function dataApiVideoResponse(opts: { videoId: string; title: string; channelId: string; channelTitle: string }) {
  return {
    items: [
      {
        id: opts.videoId,
        snippet: {
          title: opts.title,
          description: "Video enriched via Data API.",
          channelId: opts.channelId,
          channelTitle: opts.channelTitle,
          publishedAt: "2009-10-25T00:00:00Z",
          tags: ["api tag one", "api tag two", "rickroll"],
          defaultLanguage: "en",
        },
        statistics: { viewCount: "1500000000", likeCount: "16000000", commentCount: "2000000" },
        contentDetails: { duration: "PT3M33S" },
        topicDetails: { topicCategories: ["https://en.wikipedia.org/wiki/Music"] },
        status: { madeForKids: false },
      },
    ],
  };
}
