import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError, isAppError } from "@yt/validators/errors";
import type { ErrorEnvelope } from "@yt/validators";
import { reportException } from "../lib/observability.js";

/** Build the error envelope (§9). Never leaks internals/stack to the client. */
export function toEnvelope(err: unknown): { status: number; body: ErrorEnvelope } {
  if (isAppError(err)) {
    return {
      status: err.statusCode,
      body: {
        success: false,
        error: { code: err.code, message: err.message, statusCode: err.statusCode },
      },
    };
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return {
      status: 400,
      body: { success: false, error: { code: "INVALID_URL", message, statusCode: 400 } },
    };
  }
  return {
    status: 500,
    body: {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", statusCode: 500 },
    },
  };
}

/**
 * Register the single Fastify error handler that maps every thrown error to the envelope.
 * Typed AppErrors map to their status; ZodError → 400; Fastify rate-limit (429) and unknown
 * errors are normalized. Full detail is logged server-side; only safe fields reach the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError, req: FastifyRequest, reply: FastifyReply) => {
    // Fastify's built-in rate limiter throws a 429 with statusCode set but no AppError.
    if (!isAppError(err) && !(err instanceof ZodError) && err.statusCode === 429) {
      reply.status(429).send({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Please slow down and try again shortly.",
          statusCode: 429,
        },
      });
      return;
    }

    const { status, body } = toEnvelope(err);
    if (status >= 500) {
      req.log.error({ err, detail: isAppError(err) ? (err as AppError).detail : undefined }, "request failed");
      // Report only unexpected 5xx to Sentry (no-op when Sentry is unconfigured).
      reportException(err, { url: req.url, method: req.method, code: body.error.code });
    } else {
      req.log.info({ code: body.error.code, status }, "request rejected");
    }
    reply.status(status).send(body);
  });

  // 404 for unknown routes, in-envelope.
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      success: false,
      error: { code: "INTERNAL_ERROR", message: `Route ${req.method} ${req.url} not found.`, statusCode: 404 },
    });
  });
}
