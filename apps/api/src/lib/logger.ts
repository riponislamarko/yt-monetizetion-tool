import { pino, type Logger, type LoggerOptions } from "pino";
import type { Env } from "../config/env.js";

/**
 * Pino config. Pretty in dev, JSON in prod (§6.4). Redacts headers/secrets so a leaked
 * Authorization header or API key never lands in the logs.
 *
 * We expose the OPTIONS (not just an instance) so Fastify can build its own request-scoped
 * logger from the same config — passing a pre-built instance would diverge Fastify's logger
 * type from FastifyBaseLogger and break plugin typing.
 */
export function loggerOptions(env: Env): LoggerOptions {
  const isDev = env.NODE_ENV === "development";
  const axiomEnabled = Boolean(env.AXIOM_TOKEN && env.AXIOM_DATASET);

  const base: LoggerOptions = {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-api-key']",
        "*.apiKey",
        "*.password",
        "*.token",
      ],
      remove: true,
    },
  };

  // Build the transport targets. Phase 2: when Axiom is configured we ship JSON logs to
  // Axiom AND keep stdout; otherwise pretty in dev, plain stdout in prod. Absent Axiom env →
  // the @axiomhq/pino transport is never loaded, so the dependency is a true no-op.
  const targets: Array<{ target: string; options?: Record<string, unknown>; level?: string }> = [];
  if (isDev) {
    targets.push({
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname" },
    });
  } else {
    targets.push({ target: "pino/file", options: { destination: 1 } });
  }
  if (axiomEnabled) {
    targets.push({
      target: "@axiomhq/pino",
      options: { dataset: env.AXIOM_DATASET, token: env.AXIOM_TOKEN },
    });
  }

  // Only attach a transport when we have something beyond plain stdout (dev pretty or Axiom);
  // a single pino/file→stdout target is equivalent to no transport but spins a worker, so skip.
  const needsTransport = isDev || axiomEnabled;
  return needsTransport ? { ...base, transport: { targets } } : base;
}

/** Standalone logger for app-level (non-request) logging. */
export function createLogger(env: Env): Logger {
  return pino(loggerOptions(env));
}
