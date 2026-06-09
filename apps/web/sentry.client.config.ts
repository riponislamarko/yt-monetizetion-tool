// Sentry browser-side init. Fully inert when NEXT_PUBLIC_SENTRY_DSN is absent:
// `enabled: false` makes every Sentry call a no-op, and no network/transport is set up.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
});
