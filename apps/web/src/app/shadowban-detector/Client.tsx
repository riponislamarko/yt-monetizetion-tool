"use client";

import type { ShadowbanResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { ShadowbanResultView } from "@/components/tools/results/ShadowbanResultView";

export function Client() {
  return (
    <ToolRunner<ShadowbanResult>
      apiName="shadowban-detector"
      placeholder="Paste a channel URL…"
      buttonLabel="Check"
      renderResult={(data) => <ShadowbanResultView data={data} />}
    />
  );
}
