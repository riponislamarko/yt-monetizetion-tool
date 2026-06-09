import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, desc, eq, gt, rateLimitOverrides } from "@yt/db";
import type { AppContext } from "../context.js";
import { hashIp } from "../lib/ip.js";
import { setOverrideLimit, clearOverrideLimit } from "../lib/rate-overrides.js";

/**
 * Phase 2 admin routes for per-IP rate-limit overrides (§5/§6.3). Disabled entirely unless
 * ADMIN_API_KEY is configured — this is the minimal "auth decision" that §6 requires before
 * the overrides table may be managed. Auth is a bearer token (Authorization: Bearer <key>,
 * or x-admin-key). With no key set, NO admin route is registered (404).
 *
 * An override accepts either a raw `ip` (hashed here, never stored raw) or a precomputed
 * `ipHash`. The durable row goes in rate_limit_overrides; the live value is mirrored to Redis
 * so the limiter's per-request max lookup is fast and fail-soft.
 */

const createBody = z
  .object({
    ip: z.string().trim().min(1).optional(),
    ipHash: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
    dailyLimit: z.number().int().positive().max(100_000),
    ttlHours: z.number().int().positive().max(24 * 365).default(24),
  })
  .refine((v) => Boolean(v.ip) || Boolean(v.ipHash), { message: "Provide an ip or ipHash." });

export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  const adminKey = ctx.env.ADMIN_API_KEY;
  if (!adminKey) {
    ctx.log.info("Admin routes disabled (no ADMIN_API_KEY configured).");
    return;
  }

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers["authorization"];
    const bearer = typeof header === "string" ? header.replace(/^Bearer\s+/i, "") : "";
    const provided = bearer || (req.headers["x-admin-key"] as string | undefined) || "";
    if (provided !== adminKey) {
      reply.code(401).send({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Invalid admin credentials.", statusCode: 401 },
      });
    }
  };

  app.route({
    method: "POST",
    url: "/api/admin/rate-limit-overrides",
    preHandler: requireAdmin,
    schema: { tags: ["admin"], body: createBody },
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      const ipHash = body.ipHash ?? hashIp(body.ip!, ctx.env.IP_HASH_SALT);
      const ttlSeconds = body.ttlHours * 3600;
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      await ctx.db.insert(rateLimitOverrides).values({ ipHash, dailyLimit: body.dailyLimit, expiresAt });
      await setOverrideLimit(ctx.redis, ipHash, body.dailyLimit, ttlSeconds);

      reply.code(201);
      return { success: true as const, data: { ipHash, dailyLimit: body.dailyLimit, expiresAt: expiresAt.toISOString() } };
    },
  });

  app.route({
    method: "GET",
    url: "/api/admin/rate-limit-overrides",
    preHandler: requireAdmin,
    schema: { tags: ["admin"] },
    handler: async () => {
      const rows = await ctx.db
        .select()
        .from(rateLimitOverrides)
        .where(gt(rateLimitOverrides.expiresAt, new Date()))
        .orderBy(desc(rateLimitOverrides.expiresAt));
      return { success: true as const, data: rows };
    },
  });

  app.route({
    method: "DELETE",
    url: "/api/admin/rate-limit-overrides/:ipHash",
    preHandler: requireAdmin,
    schema: { tags: ["admin"], params: z.object({ ipHash: z.string().regex(/^[a-f0-9]{64}$/i) }) },
    handler: async (req) => {
      const { ipHash } = req.params as { ipHash: string };
      await ctx.db
        .delete(rateLimitOverrides)
        .where(and(eq(rateLimitOverrides.ipHash, ipHash), gt(rateLimitOverrides.expiresAt, new Date(0))));
      await clearOverrideLimit(ctx.redis, ipHash);
      return { success: true as const, data: { ipHash, removed: true } };
    },
  });

  ctx.log.info("Admin routes enabled at /api/admin/* (ADMIN_API_KEY auth).");
}
