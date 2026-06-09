"use client";

import type { TagExtractorResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { TagExtractorResultView } from "@/components/tools/results/TagExtractorResultView";

export function Client() {
  return (
    <ToolRunner<TagExtractorResult>
      apiName="tag-extractor"
      placeholder="Paste a video or channel URL…"
      buttonLabel="Extract tags"
      renderResult={(data) => <TagExtractorResultView data={data} />}
    />
  );
}
