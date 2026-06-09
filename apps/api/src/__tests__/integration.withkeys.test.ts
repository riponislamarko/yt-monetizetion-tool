import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { makeTestContext, dataApiChannelResponse, dataApiVideoResponse, watchHtml, playerJson, browseJson } from "./helpers.js";

/**
 * Data-API-keys-CONFIGURED suite (§12 counterpart to the zero-keys suite). Proves the
 * enrichment layer is used where authoritative and that `signalSource` is reported as `api`.
 * The Data API is mocked at youtube.googleapis.com.
 */

const CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA";
const VIDEO_ID = "dQw4w9WgXcQ";

const server = setupServer(
  http.get("https://youtube.googleapis.com/youtube/v3/channels", () =>
    HttpResponse.json(dataApiChannelResponse({ channelId: CHANNEL_ID, title: "API Channel", handle: "@apichannel" })),
  ),
  http.get("https://youtube.googleapis.com/youtube/v3/videos", () =>
    HttpResponse.json(dataApiVideoResponse({ videoId: VIDEO_ID, title: "API Video", channelId: CHANNEL_ID, channelTitle: "API Channel" })),
  ),
  // Mock the scrape/InnerTube layer too so data-viewer's video bundle is deterministic and
  // makes no real network calls (it always fetches the player + watch page).
  http.get("https://www.youtube.com/*", () =>
    HttpResponse.html(watchHtml({ videoId: VIDEO_ID, title: "Scraped", channelId: CHANNEL_ID, author: "Rick Astley" })),
  ),
  http.post("https://www.youtube.com/youtubei/v1/player", () =>
    HttpResponse.json(playerJson({ videoId: VIDEO_ID, title: "Scraped", channelId: CHANNEL_ID, withAds: false })),
  ),
  http.post("https://www.youtube.com/youtubei/v1/browse", () => HttpResponse.json(browseJson(CHANNEL_ID))),
);

let app: FastifyInstance;
beforeAll(async () => {
  server.listen({ onUnhandledRequest: "bypass" });
  app = await buildApp(makeTestContext({}, { keys: ["k1", "k2"] }));
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

describe("channel-id-finder (Data API enrichment)", () => {
  it("returns API-sourced metadata and signalSource=api", async () => {
    const { status, json } = await call("/api/tools/channel-id-finder", {
      url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    });
    expect(status).toBe(200);
    expect(json.signalSource).toBe("api");
    expect(json.data.channelId).toBe(CHANNEL_ID);
    expect(json.data.channelTitle).toBe("API Channel");
    expect(json.data.subscriberCount).toBe(1_200_000); // exact figure only the API provides
    expect(json.data.createdAt).toBe("2015-01-01T00:00:00Z");
  });
});

describe("tag-extractor (Data API tags)", () => {
  it("uses videos.list snippet.tags with signalSource=api", async () => {
    const { status, json } = await call("/api/tools/tag-extractor", {
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    });
    expect(status).toBe(200);
    expect(json.signalSource).toBe("api");
    expect(json.data.tags).toContain("rickroll");
    expect(json.data.tagCount).toBe(3);
    expect(json.data.remainingCharacters).toBeTypeOf("number");
  });
});

describe("data-viewer (Data API video parts)", () => {
  it("returns engagement metrics derived from API stats", async () => {
    const { status, json } = await call("/api/tools/data-viewer", {
      url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
    });
    expect(status).toBe(200);
    expect(json.data.type).toBe("video");
    expect(json.data.video.likeCount).toBe(16_000_000);
    expect(json.data.derivedMetrics.likeToViewRatio).toBeGreaterThan(0);
  });
});
