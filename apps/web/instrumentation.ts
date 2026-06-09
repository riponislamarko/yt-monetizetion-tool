// Next.js instrumentation hook. @sentry/nextjs v8 loads the server/edge configs here.
// Both configs are themselves guarded (enabled:false without a DSN), so this is safe to
// run unconditionally.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
