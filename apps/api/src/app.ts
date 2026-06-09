import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import scalar from "@scalar/fastify-api-reference";
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from "fastify-type-provider-zod";
import type { AppContext } from "./context.js";
import { loggerOptions } from "./lib/logger.js";
import { registerErrorHandler } from "./errors/handler.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerToolRoutes } from "./routes/tools/index.js";
import { registerArcjet } from "./plugins/arcjet.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { hashIp } from "./lib/ip.js";
import { getOverrideLimit } from "./lib/rate-overrides.js";

/**
 * Build the Fastify instance: Zod type provider (single source of truth for validation +
 * OpenAPI), security plugins, Redis-backed per-IP rate limiting (§6.3), Scalar docs at
 * /api/docs, the global error handler, and all routes.
 */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({ logger: loggerOptions(ctx.env), trustProxy: true });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: ctx.env.CORS_ORIGIN.split(",").map((s) => s.trim()) });

  // Phase 2: Arcjet bot/abuse shield in FRONT of the per-IP limiter (no-op without ARCJET_KEY).
  registerArcjet(app, ctx);

  await app.register(rateLimit, {
    // Per-request max: a configured per-IP override (Phase 2) wins over the default cap. The
    // override lookup is fail-soft (Redis down → default). Falls back to RATE_LIMIT_MAX.
    max: async (req) => {
      const override = await getOverrideLimit(ctx.redis, hashIp(req.ip, ctx.env.IP_HASH_SALT));
      return override ?? ctx.env.RATE_LIMIT_MAX;
    },
    timeWindow: ctx.env.RATE_LIMIT_WINDOW,
    // Use Redis as the shared store when reachable. In tests we use the in-process store to
    // avoid needing a real Redis with Lua support.
    ...(ctx.env.NODE_ENV === "test" ? {} : { redis: ctx.redis }),
    // Degrade-OPEN if the Redis store errors (e.g. Redis down): allow the request rather than
    // 500. Required by §15 — the app must fully function with Redis down (cache/limiter
    // fail-soft). The trade-off is that limiting is not enforced while Redis is unreachable.
    skipOnError: true,
    keyGenerator: (req) => req.ip,
    nameSpace: "rl:",
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "YouTube Toolkit API", version: "1.0.0", description: "8 YouTube analysis tools." },
      servers: [{ url: "/" }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(scalar, { routePrefix: "/api/docs" });

  registerErrorHandler(app);
  registerHealthRoutes(app, ctx);
  registerToolRoutes(app, ctx);
  registerAdminRoutes(app, ctx); // Phase 2: no-op without ADMIN_API_KEY

  return app;
}
