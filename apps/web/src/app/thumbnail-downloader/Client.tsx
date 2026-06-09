"use client";

import type { ThumbnailResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { ThumbnailResultView } from "@/components/tools/results/ThumbnailResultView";

export function Client() {
  return (
    <ToolRunner<ThumbnailResult>
      apiName="thumbnail-downloader"
      placeholder="Paste a video URL or ID…"
      buttonLabel="Get thumbnails"
      renderResult={(data) => <ThumbnailResultView data={data} />}
    />
  );
}
