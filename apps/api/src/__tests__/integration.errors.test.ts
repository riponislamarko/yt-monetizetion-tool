import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import { makeTestContext, watchHtml } from "./helpers.js";

/**
 * Per-route error-mapping suite (§12): every typed error maps to the right status + envelope.
 * Covers INVALID_URL, CHANNEL_NOT_FOUND, VIDEO_NOT_FOUND, SCRAPING_FAILED, RATE_LIMITED, and
 * QUOTA_EXHAUSTED (the last via the Data-API path with an exhausted key).
 */

const CHANNEL_ID = "UCX6OQ3DkcsbYNE6H8uQQuVA";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function inject(app: FastifyInstance, path: string, body: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: path, payload: body });
  return { status: res.statusCode, json: res.json() as Record<string, any> };
}

describe("error mappings", () => {
  it("INVALID_URL → 400 (non-YouTube host)", async () => {
    const app = await buildApp(makeTestContext());
    const { status, json } = await inject(app, "/api/tools/monetization-checker", { url: "https://vimeo.com/1" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("INVALID_URL");
    await app.close();
  });

  it("CHANNEL_NOT_FOUND → 404 (channel page has no ytInitialData)", async () => {
    server.use(
      http.get("https://www.youtube.com/*", () => HttpResponse.html("<html><body>nope</body></html>")),
    );
    const app = await buildApp(makeTestContext());
    const { status, json } = await inject(app, "/api/tools/data-viewer", {
      url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    });
    expect(status).toBe(404);
    expect(json.error.code).toBe("CHANNEL_NOT_FOUND");
    await app.close();
  });

  it("VIDEO_NOT_FOUND → 404 (player + page both fail)", async () => {
    server.use(
      http.post("https://www.youtube.com/youtubei/v1/player", () => new HttpResponse(null, { status: 500 })),
      http.get("https://www.youtube.com/*", () => new HttpResponse(null, { status: 404 })),
    );
    const app = await buildApp(makeTestContext());
    const { status, json } = await inject(app, "/api/tools/data-viewer", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(status).toBe(404);
    expect(json.error.code).toBe("VIDEO_NOT_FOUND");
    await app.close();
  });

  it("SCRAPING_FAILED → 502 (channel page returns HTTP 500)", async () => {
    server.use(http.get("https://www.youtube.com/*", () => new HttpResponse(null, { status: 500 })));
    const app = await buildApp(makeTestContext());
    const { status, json } = await inject(app, "/api/tools/data-viewer", {
      url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
    });
    expect(status).toBe(502);
    expect(json.error.code).toBe("SCRAPING_FAILED");
    await app.close();
  });

  it("RATE_LIMITED → 429 (per-IP limit of 1)", async () => {
    const app = await buildApp(makeTestContext({ RATE_LIMIT_MAX: 1 }));
    const body = { monthlyViews: 1000, country: "US" };
    const first = await inject(app, "/api/tools/money-calculator", body);
    const second = await inject(app, "/api/tools/money-calculator", body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.json.error.code).toBe("RATE_LIMITED");
    await app.close();
  });

  it("QUOTA_EXHAUSTED → 429 (Data API key exhausted, handle resolution)", async () => {
    // One key, its counter seeded at the budget so a 1-unit call cannot fit.
    const ctx = makeTestContext({}, { keys: ["k1"], seedQuota: { "quota:2026-06-08:1": 9500 } });
    server.use(
      // Provide a watch page so non-API paths could work, but handle resolution hits the API first.
      http.get("https://www.youtube.com/*", () =>
        HttpResponse.html(watchHtml({ videoId: "x", title: "t", channelId: CHANNEL_ID, author: "a" })),
      ),
    );
    const app = await buildApp(ctx);
    const { status, json } = await inject(app, "/api/tools/channel-id-finder", {
      url: "https://www.youtube.com/@SomeHandle",
    });
    expect(status).toBe(429);
    expect(json.error.code).toBe("QUOTA_EXHAUSTED");
    await app.close();
  });
});
