import type { ImageToolResult } from "@yt/validators";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { orUnknown } from "@/lib/utils";

interface ImageEntry {
  label: string;
  url: string;
  width: number | null;
  height: number | null;
  available: boolean;
}

function dims(e: ImageEntry): string {
  if (e.width && e.height) return `${e.width} × ${e.height}`;
  return "Size unknown";
}

function ImageGroup({
  title,
  entries,
  wide,
}: {
  title: string;
  entries: ImageEntry[];
  wide?: boolean;
}) {
  // Only surface entries that actually resolved; the API probes availability.
  const available = entries.filter((e) => e.available);
  if (available.length === 0) return null;

  return (
    <div>
      <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className={wide ? "space-y-4" : "grid grid-cols-2 gap-4 sm:grid-cols-3"}>
        {available.map((e) => (
          <div
            key={`${e.label}-${e.url}`}
            className="overflow-hidden rounded-lg border border-border"
          >
            {/* Use a plain <img>: these are external CDN assets and we want the raw,
                un-optimized image so the download link matches what's shown. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={e.url}
              alt={e.label}
              loading="lazy"
              // YouTube's CDN returns 429/403 for cross-origin requests that carry a Referer
              // header, so suppress it — otherwise the images render broken in the browser.
              referrerPolicy="no-referrer"
              className={wide ? "h-auto w-full object-cover" : "aspect-square w-full object-cover"}
            />
            <div className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{e.label}</p>
                <p className="text-[11px] text-muted-foreground">{dims(e)}</p>
              </div>
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
                title="Open / download full image"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ImageToolResultView({ data }: { data: ImageToolResult }) {
  const title = data.type === "channel" ? data.channelTitle : data.videoTitle;
  const hasAny =
    data.profilePictures.some((p) => p.available) ||
    data.bannerImages.some((b) => b.available) ||
    data.thumbnails.some((t) => t.available);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{orUnknown(title)}</CardTitle>
        <Badge variant="outline" className="w-fit capitalize">
          {data.type}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        <ImageGroup title="Profile pictures" entries={data.profilePictures} />
        <ImageGroup title="Banner images" entries={data.bannerImages} wide />
        <ImageGroup title="Thumbnails" entries={data.thumbnails} />
        {!hasAny ? (
          <p className="text-sm text-muted-foreground">
            No images resolved for this {data.type}. They may be unavailable.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
