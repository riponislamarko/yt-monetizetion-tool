"use client";

import type { DataViewerResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { DataViewerResultView } from "@/components/tools/results/DataViewerResultView";

export function Client() {
  return (
    <ToolRunner<DataViewerResult>
      apiName="data-viewer"
      placeholder="Paste a video or channel URL…"
      buttonLabel="View data"
      renderResult={(data) => <DataViewerResultView data={data} />}
    />
  );
}
