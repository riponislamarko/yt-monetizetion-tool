import { Zap, RefreshCcw, Clock } from "lucide-react";
import type { SignalSource } from "@yt/validators";
import { Badge } from "@/components/ui/badge";

const SIGNAL_LABEL: Record<SignalSource, string> = {
  innertube: "InnerTube",
  scrape: "Scrape",
  api: "Data API",
  mixed: "Mixed",
  computed: "Computed",
};

/** Small metadata strip shown above every result: cache state, signal source, timing. */
export function ResultMeta({
  cached,
  signalSource,
  processingTimeMs,
}: {
  cached: boolean;
  signalSource: SignalSource;
  processingTimeMs: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      {cached ? (
        <Badge variant="warning">
          <Zap className="h-3 w-3" /> Cached
        </Badge>
      ) : (
        <Badge variant="success">
          <RefreshCcw className="h-3 w-3" /> Fresh
        </Badge>
      )}
      <Badge variant="outline" title="Which data layer produced this result">
        Source: {SIGNAL_LABEL[signalSource] ?? signalSource}
      </Badge>
      <Badge variant="secondary">
        <Clock className="h-3 w-3" /> {Math.round(processingTimeMs)} ms
      </Badge>
    </div>
  );
}
