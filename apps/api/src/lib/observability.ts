import * as Sentry from "@sentry/node";
import type { Logger } from "pino";
import type { Env } from "../config/env.js";

/**
 * Phase 2 error monitoring (§6.4). Sentry initialises ONLY when SENTRY_DSN is configured;
 * otherwise it is a complete no-op (we never call `init`, and `reportException` short-circuits).
 * A single info-level line is logged on the disabled path — never crash, never 500 (§1).
 */

let enabled = false;

export function initSentry(env: Env, log: Logger): boolean {
  if (!env.SENTRY_DSN) {
    log.info("Sentry disabled (no SENTRY_DSN configured).");
    return false;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
  enabled = true;
  log.info("Sentry enabled.");
  return true;
}

/** Report a server-side exception. No-op when Sentry is not configured. */
export function reportException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export async function closeSentry(): Promise<void> {
  if (!enabled) return;
  await Sentry.close(2000).catch(() => undefined);
}
