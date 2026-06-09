"use client";

import type { ChannelIdResult } from "@yt/validators";
import { ToolRunner } from "@/components/tools/ToolRunner";
import { ChannelIdResultView } from "@/components/tools/results/ChannelIdResultView";

export function Client() {
  return (
    <ToolRunner<ChannelIdResult>
      apiName="channel-id-finder"
      placeholder="Paste any channel, @handle or video URL…"
      buttonLabel="Find ID"
      renderResult={(data) => <ChannelIdResultView data={data} />}
    />
  );
}
