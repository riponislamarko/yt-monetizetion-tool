"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { MonetizationResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { MonetizationResultView } from "@/components/tools/results/MonetizationResultView";

function Inner() {
  // Prefill + auto-run when arriving from the homepage hero search (?url=).
  const initialUrl = useSearchParams().get("url") ?? "";
  return (
    <ToolRunner<MonetizationResult>
      apiName="monetization-checker"
      placeholder="Paste a channel or video URL…"
      buttonLabel="Check"
      initialUrl={initialUrl}
      renderResult={(data) => <MonetizationResultView data={data} />}
    />
  );
}

export function Client() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
