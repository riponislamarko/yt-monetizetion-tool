import type { FastifyInstance } from "fastify";
import { sql } from "@yt/db";
import type { AppContext } from "../context.js";

/**
 * Liveness + readiness (§6.5).
 *   /healthz — 200 always if the process is up.
 *   /readyz  — checks DB + Redis. 200 only if DB is reachable. Cache (Redis) being down
 *              still returns ready (cache is optional) but reports "degraded".
 */
export function registerHealthRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async (_req, reply) => {
    let dbOk = false;
    let redisOk = false;
    try {
      await ctx.db.execute(sql`select 1`);
      dbOk = true;
    } catch (err) {
      ctx.log.warn({ err: (err as Error)?.message }, "readyz: DB ping failed");
    }
    try {
      const pong = await ctx.redis.ping();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }

    const ready = dbOk; // cache optional; DB required
    const status = !ready ? "unready" : redisOk ? "ready" : "degraded";
    reply.status(ready ? 200 : 503).send({
      status,
      checks: { database: dbOk, cache: redisOk },
    });
  });
}
