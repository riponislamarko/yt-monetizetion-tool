import { describe, it, expect } from "vitest";
import { buildApp } from "../app.js";
import { makeTestContext } from "./helpers.js";
import { hashIp } from "../lib/ip.js";

/**
 * Phase 2 admin rate-limit-overrides (§5/§6.3). Proves: the routes are DISABLED without
 * ADMIN_API_KEY; require the bearer token; and a created override raises the per-IP cap that
 * the limiter enforces.
 */

const ADMIN_KEY = "test-admin-key-0123456789";
const money = { monthlyViews: 1000, country: "US" };

describe("admin routes — disabled without ADMIN_API_KEY", () => {
  it("returns 404 (route not registered)", async () => {
    const app = await buildApp(makeTestContext());
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/rate-limit-overrides",
      payload: { ip: "1.2.3.4", dailyLimit: 50 },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("admin routes — enabled", () => {
  it("rejects a request without the admin token (401)", async () => {
    const app = await buildApp(makeTestContext({ ADMIN_API_KEY: ADMIN_KEY }));
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/rate-limit-overrides",
      payload: { ip: "1.2.3.4", dailyLimit: 50 },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
    await app.close();
  });

  it("an override raises the per-IP rate-limit cap", async () => {
    // Default cap of 1: a second un-overridden request would be 429.
    const ctx = makeTestContext({ ADMIN_API_KEY: ADMIN_KEY, RATE_LIMIT_MAX: 1 });
    const app = await buildApp(ctx);

    const ipHash = hashIp("127.0.0.1", ctx.env.IP_HASH_SALT); // inject's default remote address

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/rate-limit-overrides",
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
      payload: { ipHash, dailyLimit: 100, ttlHours: 1 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.dailyLimit).toBe(100);

    // With the override in Redis, the limiter now allows well beyond the default cap of 1.
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ method: "POST", url: "/api/tools/money-calculator", payload: money });
      expect(res.statusCode).toBe(200);
    }
    await app.close();
  });
});
