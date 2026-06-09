import type { DataViewerResult } from "@yt/validators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/tools/Field";
import {
  formatNumber,
  formatFullNumber,
  orUnknown,
  formatDate,
  formatDuration,
  formatPercent,
} from "@/lib/utils";

function TagList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <Badge key={t} variant="outline">{t}</Badge>
        ))}
      </div>
    </div>
  );
}

export function DataViewerResultView({ data }: { data: DataViewerResult }) {
  const { channel, video, derivedMetrics: m } = data;

  return (
    <div className="space-y-4">
      {video ? (
        <Card>
          <CardHeader>
            <CardTitle>{orUnknown(video.title)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Video · {orUnknown(video.channelTitle)}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGrid>
              <Field label="Views" value={formatFullNumber(video.viewCount)} />
              <Field label="Likes" value={formatNumber(video.likeCount)} />
              <Field label="Comments" value={formatNumber(video.commentCount)} />
              <Field label="Duration" value={formatDuration(video.durationSeconds)} />
              <Field label="Published" value={formatDate(video.publishedAt)} />
              <Field label="Language" value={orUnknown(video.defaultLanguage)} />
              <Field
                label="Made for kids"
                value={
                  video.madeForKids === null
                    ? "Unknown"
                    : video.madeForKids
                      ? "Yes"
                      : "No"
                }
              />
            </FieldGrid>
            <TagList title="Tags" items={video.tags} />
            <TagList title="Topics" items={video.topicCategories} />
            {video.description ? (
              <div className="rounded-md border border-border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground line-clamp-6">
                  {video.description}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {channel ? (
        <Card>
          <CardHeader>
            <CardTitle>{orUnknown(channel.title)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Channel{channel.isVerified ? " · Verified" : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGrid>
              <Field label="Subscribers" value={formatNumber(channel.subscriberCount)} />
              <Field label="Videos" value={formatNumber(channel.videoCount)} />
              <Field label="Views" value={formatNumber(channel.viewCount)} />
              <Field label="Country" value={orUnknown(channel.country)} />
              <Field label="Created" value={formatDate(channel.publishedAt)} />
              <Field label="Custom URL" value={orUnknown(channel.customUrl)} />
            </FieldGrid>
            <TagList title="Keywords" items={channel.keywords} />
            <TagList title="Topics" items={channel.topicCategories} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Derived metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <Field label="Engagement rate" value={formatPercent(m.engagementRate)} />
            <Field label="Like / view" value={formatPercent(m.likeToViewRatio)} />
            <Field label="Comment / view" value={formatPercent(m.commentToViewRatio)} />
            <Field
              label="Avg views / video"
              value={formatNumber(m.averageViewsPerVideo)}
            />
            <Field
              label="Uploads / week"
              value={
                m.estimatedUploadFrequency === null
                  ? "Unknown"
                  : m.estimatedUploadFrequency.toFixed(1)
              }
            />
            <Field
              label="Subs / day"
              value={
                m.subscribersPerDay === null ? "Unknown" : formatNumber(Math.round(m.subscribersPerDay))
              }
            />
            <Field
              label="Channel age (days)"
              value={formatFullNumber(m.channelAgeInDays)}
            />
          </FieldGrid>
        </CardContent>
      </Card>
    </div>
  );
}
