"use client";

import type { ImageToolResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { ImageToolResultView } from "@/components/tools/results/ImageToolResultView";

export function Client() {
  return (
    <ToolRunner<ImageToolResult>
      apiName="image-tool"
      placeholder="Paste a channel or video URL…"
      buttonLabel="Get images"
      renderResult={(data) => <ImageToolResultView data={data} />}
    />
  );
}
