import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import {
  makeTestContext,
  channelHtml,
  watchHtml,
  playerJson,
  browseJson,
} from "./helpers.js";

const CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA";
const VIDEO_ID = "dQw4w9WgXcQ";

/**
 * Integration suite (§12). MSW mocks BOTH the InnerTube/HTML layer AND (implicitly) the Data
 * API — this whole file runs with ZERO Data API keys, proving every tool works on the
 * scraping layer alone (the mandated "no keys configured" suite).
 */
const server = setupServer(
  // HTML pages (channel + watch). fetchHtml appends ?hl&gl — query is ignored by the matcher.
  http.get("https://www.youtube.com/*", ({ request }) => {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("/watch")) {
      return HttpResponse.html(
        watchHtml({ videoId: VIDEO_ID, title: "Never Gonna Give You Up", channelId: CHANNEL_ID, author: "Rick Astley" }),
      );
    }
    // channel page, @handle, /c, /user all resolve to the same canned channel.
    return HttpResponse.html(channelHtml({ channelId: CHANNEL_ID, title: "Test Channel", join: true }));
  }),
  http.get("https://m.youtube.com/*", () =>
    HttpResponse.html(channelHtml({ channelId: CHANNEL_ID, title: "Test Channel" })),
  ),
  // InnerTube endpoints.
  http.post("https://www.youtube.com/youtubei/v1/player", () =>
    HttpResponse.json(playerJson({ videoId: VIDEO_ID, title: "Never Gonna Give You Up", channelId: CHANNEL_ID, withAds: true })),
  ),
  http.post("https://www.youtube.com/youtubei/v1/browse", () => HttpResponse.json(browseJson(CHANNEL_ID))),
  // Thumbnail / image HEAD probes.
  http.head("https://i.ytimg.com/*", () => new HttpResponse(null, { status: 200, headers: { "content-length": "12345" } })),
  http.head("https://yt3.ggpht.com/*", () => new HttpResponse(null, { status: 200 })),
);

let app: FastifyInstance;

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "bypass" });
  app = await buildApp(makeTestContext());
  await app.ready();
});
afterEach(() => server.resetHandlers());
afterAll(async () => {
  server.close();
  await app.close();
});

async function call(path: string, body: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: path, payload: body });
  return { status: res.statusCode, json: res.json() as Record<string, any> };
}

describe("health", () => {
  it("/healthz is always 200", async () => {
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });
});

describe("envelope + error mapping", () => {
  it("invalid URL → 400 with INVALID_URL code", async () => {
    const { status, json } = await call("/api/tools/thumbnail-downloader", { url: "https://vimeo.com/1" });
    expect(status).toBe(400);
    expect(json.success).toBe(false);
    expect((json.error as Record<string, unknown>).code).toBe("INVALID_URL");
  });

  it("missing body field → 400", async () => {
    const { status } = await call("/api/tools/thumbnail-downloader", {});
    expect(status).toBe(400);
  });
});

describe("thumbnail-downloader (scrape-only)", () => {
  it("returns the success envelope with probed thumbnails", async () => {
    const { status, json } = await call("/api/tools/thumbnail-downloader", {
      url: `https://youtu.be/${VIDEO_ID}`,
    });
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.cached).toBe(false);
    const data = json.data as Record<string, unknown>;
    expect(data.videoId).toBe(VIDEO_ID);
    expect(Array.isArray(data.thumbnails)).toBe(true);
    expect((data.thumbnails as unknown[]).length).toBeGreaterThan(0);
  });

  it("second identical call is served from cache", async () => {
    await call("/api/tools/thumbnail-downloader", { url: `https://youtu.be/${VIDEO_ID}` });
    const { json } = await call("/api/tools/thumbnail-downloader", { url: `https://youtu.be/${VIDEO_ID}` });
    expect(json.cached).toBe(true);
  });
});

describe("channel-id-finder (scrape-only)", () => {
  it("resolves a handle to a channel ID", async () => {
    const { status, json } = await call("/api/tools/channel-id-finder", {
      url: "https://www.youtube.com/@TestChannel",
    });
    expect(status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.channelId).toBe(CHANNEL_ID);
    expect(json.signalSource).toBe("scrape");
  });
});

describe("monetization-checker (InnerTube + scrape)", () => {
  it("classifies a video with ads", async () => {
    const { status, json } = await call("/api/tools/monetization-checker", {
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    });
    expect(status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.type).toBe("video");
    expect(data.channelId).toBe(CHANNEL_ID);
    expect(typeof data.monetizationScore).toBe("number");
    expect(["monetized", "likely_monetized", "unlikely", "not_monetized"]).toContain(data.monetizationStatus);
    expect(data.hasAds).toBe(true);
  });
});

describe("money-calculator (manual, computed)", () => {
  it("computes earnings from manual inputs with no network", async () => {
    const { status, json } = await call("/api/tools/money-calculator", {
      monthlyViews: 1_000_000,
      niche: "finance",
      country: "US",
    });
    expect(status).toBe(200);
    expect(json.signalSource).toBe("computed");
    const data = json.data as { earnings: { monthly: { avg: number } }; detectedNiche: string };
    expect(data.earnings.monthly.avg).toBeGreaterThan(0);
    expect(data.detectedNiche).toBe("finance");
  });
});

describe("tag-extractor (scrape-only)", () => {
  it("extracts video tags from the watch page", async () => {
    const { status, json } = await call("/api/tools/tag-extractor", {
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    });
    expect(status).toBe(200);
    const data = json.data as Record<string, unknown>;
    expect(data.type).toBe("video");
    expect((data.tags as string[]).length).toBeGreaterThan(0);
  });
});
