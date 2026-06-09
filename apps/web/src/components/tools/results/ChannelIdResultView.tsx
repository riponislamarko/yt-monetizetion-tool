import type { ChannelIdResult } from "@yt/validators";
import Image from "next/image";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/tools/Field";
import { CopyButton } from "@/components/tools/CopyButton";
import { formatNumber, orUnknown, formatDate } from "@/lib/utils";

export function ChannelIdResultView({ data }: { data: ChannelIdResult }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          {data.thumbnailUrl ? (
            <Image
              src={data.thumbnailUrl}
              alt={orUnknown(data.channelTitle)}
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
              unoptimized
            />
          ) : (
            <div className="h-14 w-14 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-lg font-semibold">
              {orUnknown(data.channelTitle)}
              {data.isVerified ? <BadgeCheck className="h-4 w-4 text-primary" /> : null}
            </p>
            {data.handle ? (
              <p className="truncate text-sm text-muted-foreground">{data.handle}</p>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Channel ID</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-sm">
              {data.channelId}
            </code>
            <CopyButton value={data.channelId} label="Copy ID" />
          </div>
        </div>

        <FieldGrid>
          <Field label="Subscribers" value={formatNumber(data.subscriberCount)} />
          <Field label="Videos" value={formatNumber(data.videoCount)} />
          <Field label="Views" value={formatNumber(data.viewCount)} />
          <Field label="Country" value={orUnknown(data.country)} />
          <Field label="Created" value={formatDate(data.createdAt)} />
          <Field label="Custom URL" value={orUnknown(data.customUrl)} />
        </FieldGrid>

        {data.description ? (
          <div className="rounded-md border border-border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Description</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground line-clamp-6">
              {data.description}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={data.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-4 w-4" /> Open channel
          </a>
          <CopyButton value={data.channelUrl} label="Copy URL" />
        </div>
        {data.userId ? <Badge variant="outline">Legacy user ID: {data.userId}</Badge> : null}
      </CardContent>
    </Card>
  );
}
