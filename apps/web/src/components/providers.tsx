"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { PostHogProvider } from "@/components/posthog-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            // Don't retry deterministic client/quota errors; allow one retry for upstream blips.
            retry: (failureCount, error) => {
              if (error instanceof ApiError) {
                const noRetry: ReadonlySet<string> = new Set([
                  "INVALID_URL",
                  "CHANNEL_NOT_FOUND",
                  "VIDEO_NOT_FOUND",
                  "QUOTA_EXHAUSTED",
                  "RATE_LIMITED",
                ]);
                if (noRetry.has(error.code)) return false;
              }
              return failureCount < 1;
            },
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider>{children}</PostHogProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
