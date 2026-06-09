"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { markAnalyticsReady, capturePageview } from "@/lib/analytics";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

/**
 * Captures a `$pageview` on every client-side route change. No-op until PostHog is ready.
 * Lives under a Suspense boundary because useSearchParams opts the subtree into client
 * rendering.
 */
function PostHogPageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    let url = window.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    capturePageview(url);
  }, [pathname, searchParams]);

  return null;
}

/**
 * Initialises PostHog exactly once, only when a key is configured. With no key this renders
 * children and does nothing beyond a single guarded info log.
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (initialized) return;
    if (!POSTHOG_KEY) {
      // eslint-disable-next-line no-console
      console.info("[analytics] PostHog disabled (NEXT_PUBLIC_POSTHOG_KEY not set)");
      return;
    }
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // We track pageviews manually (App Router has no full page reloads).
      capture_pageview: false,
      capture_pageleave: true,
    });
    initialized = true;
    markAnalyticsReady();
  }, []);

  return (
    <>
      <React.Suspense fallback={null}>
        <PostHogPageviewTracker />
      </React.Suspense>
      {children}
    </>
  );
}
