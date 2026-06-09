import type { ThumbnailResult } from "@yt/validators";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/tools/CopyButton";
import { orUnknown, formatBytes } from "@/lib/utils";

export function ThumbnailResultView({ data }: { data: ThumbnailResult }) {
  const available = data.thumbnails.filter((t) => t.available);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{orUnknown(data.videoTitle)}</CardTitle>
        <p className="text-sm text-muted-foreground">{orUnknown(data.channelTitle)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No thumbnails resolved for this video.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {available.map((t) => (
              <div key={t.quality} className="overflow-hidden rounded-lg border border-border">
                {/* External CDN image shown raw so the download matches exactly. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.url}
                  alt={`${t.label} thumbnail`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="aspect-video w-full bg-muted object-cover"
                />
                <div className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.width} × {t.height}
                      {t.fileSize !== null ? ` · ${formatBytes(t.fileSize)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <CopyButton value={t.url} label="URL" />
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {data.thumbnails.length > available.length ? (
          <Badge variant="outline">
            {data.thumbnails.length - available.length} resolution(s) unavailable for this video
          </Badge>
        ) : null}
      </CardContent>
    </Card>
  );
}
