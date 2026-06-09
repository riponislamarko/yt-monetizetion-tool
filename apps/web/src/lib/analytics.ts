// Thin, safe wrapper over posthog-js. Every export here is a no-op when PostHog was never
// initialised (i.e. no NEXT_PUBLIC_POSTHOG_KEY), so callers never need to guard.
//
// Readiness is tracked via an explicit module-level flag set by the PostHogProvider after a
// successful init() — we deliberately avoid posthog's internal `__loaded` field, which is
// not part of the public typed surface.
import posthog from "posthog-js";

let ready = false;

/** Called once by PostHogProvider after posthog.init() succeeds. */
export function markAnalyticsReady(): void {
  ready = true;
}

/** Capture an analytics event. Silently does nothing when PostHog is disabled. */
export function capture(event: string, props?: Record<string, unknown>): void {
  if (!ready || typeof window === "undefined") return;
  posthog.capture(event, props);
}

/** Capture a manual pageview. No-op when PostHog is disabled. */
export function capturePageview(url: string): void {
  if (!ready || typeof window === "undefined") return;
  posthog.capture("$pageview", { $current_url: url });
}
