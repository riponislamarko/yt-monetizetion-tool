"use client";

import * as React from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import type { ToolResponse } from "@/lib/api-client";
import { useToolQuery } from "@/hooks/useToolQuery";
import { ToolInput } from "@/components/tools/ToolInput";
import { LoadingSkeleton } from "@/components/tools/LoadingSkeleton";
import { ErrorState } from "@/components/tools/ErrorState";
import { ResultMeta } from "@/components/tools/ResultMeta";
import { capture } from "@/lib/analytics";

/**
 * Generic URL-input tool runner: input (real-time Zod validation) → skeleton → error →
 * result. The result body is rendered by the caller-supplied `renderResult`. The cache /
 * signal-source / timing meta strip is rendered automatically above the result.
 */
export function ToolRunner<TResult>({
  apiName,
  placeholder,
  buttonLabel,
  renderResult,
  initialUrl = "",
}: {
  apiName: string;
  placeholder?: string;
  buttonLabel?: string;
  renderResult: (data: TResult) => React.ReactNode;
  /** Prefill the input and auto-run once (e.g. from the homepage hero ?url=). */
  initialUrl?: string;
}) {
  const mutation = useToolQuery<TResult>(apiName);
  const lastUrl = React.useRef<string>("");

  const run = React.useCallback(
    (url: string) => {
      lastUrl.current = url;
      // No-op unless PostHog is configured.
      capture("tool_run", { tool: apiName });
      mutation.mutate({ url });
    },
    [mutation, apiName],
  );

  // Auto-run once when arriving with a prefilled URL.
  const didAutoRun = React.useRef(false);
  React.useEffect(() => {
    if (initialUrl && !didAutoRun.current) {
      didAutoRun.current = true;
      run(initialUrl);
    }
  }, [initialUrl, run]);

  const result: ToolResponse<TResult> | undefined = mutation.data;

  return (
    <div className="space-y-6">
      <ToolInput
        onSubmit={run}
        isLoading={mutation.isPending}
        placeholder={placeholder}
        buttonLabel={buttonLabel}
        initialUrl={initialUrl}
      />

      {mutation.isPending ? <LoadingSkeleton /> : null}

      {mutation.isError && !mutation.isPending ? (
        <ErrorState
          error={mutation.error}
          onRetry={lastUrl.current ? () => run(lastUrl.current) : undefined}
        />
      ) : null}

      {/* Subtle fade/slide-in of the result region. reducedMotion="user" makes framer
          respect prefers-reduced-motion automatically. */}
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait">
          {result && !mutation.isPending && !mutation.isError ? (
            <motion.div
              key="tool-result"
              className="space-y-3"
              data-testid="tool-result"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <ResultMeta
                cached={result.cached}
                signalSource={result.signalSource}
                processingTimeMs={result.processingTimeMs}
              />
              {renderResult(result.data)}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </MotionConfig>
    </div>
  );
}
