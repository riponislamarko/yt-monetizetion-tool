import type { FastifyInstance } from "fastify";
import arcjet, { shield, detectBot } from "@arcjet/node";
import type { AppContext } from "../context.js";

/**
 * Phase 2 edge bot/abuse protection (§6.3), sitting in front of the per-IP rate limiter.
 * Enabled ONLY when ARCJET_KEY is configured; otherwise a complete no-op (no hook registered).
 *
 * Fail-OPEN: if the Arcjet backend errors or is slow, we log at debug and allow the request —
 * a protection hiccup must never take the API down (§1). Health checks are never gated.
 */
export function registerArcjet(app: FastifyInstance, ctx: AppContext): boolean {
  const key = ctx.env.ARCJET_KEY;
  if (!key) {
    ctx.log.info("Arcjet disabled (no ARCJET_KEY configured).");
    return false;
  }

  const aj = arcjet({
    key,
    characteristics: ["ip.src"],
    rules: [
      shield({ mode: "LIVE" }),
      // Block automated clients but allow legitimate search-engine + uptime-monitor bots.
      detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR"] }),
    ],
  });

  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/healthz") || request.url.startsWith("/readyz")) return;
    try {
      const decision = await aj.protect(request.raw);
      if (decision.isDenied()) {
        reply.code(403).send({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: decision.reason.isBot()
              ? "Automated traffic is not allowed."
              : "Request blocked by the security policy.",
            statusCode: 403,
          },
        });
      }
    } catch (err) {
      ctx.log.debug({ err: (err as Error)?.message }, "Arcjet protect failed — allowing request (fail-open)");
    }
  });

  ctx.log.info("Arcjet enabled.");
  return true;
}
