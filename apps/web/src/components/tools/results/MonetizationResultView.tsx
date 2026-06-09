import type { MonetizationResult } from "@yt/validators";
import Image from "next/image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/tools/Field";
import { formatNumber, formatCurrency, orUnknown } from "@/lib/utils";

const STATUS: Record<
  MonetizationResult["monetizationStatus"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  monetized: { label: "Monetized", variant: "success" },
  likely_monetized: { label: "Likely monetized", variant: "success" },
  unlikely: { label: "Unlikely monetized", variant: "warning" },
  not_monetized: { label: "Not monetized", variant: "destructive" },
};

function YesNo({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-muted-foreground">Unknown</span>;
  return value ? <span>Yes</span> : <span>No</span>;
}

export function MonetizationResultView({ data }: { data: MonetizationResult }) {
  const status = STATUS[data.monetizationStatus];

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
            <p className="truncate text-lg font-semibold">{orUnknown(data.channelTitle)}</p>
            <p className="text-sm capitalize text-muted-foreground">{data.type}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="outline">Score {data.monetizationScore}/100</Badge>
          <Badge variant="secondary">Confidence {Math.round(data.confidence * 100)}%</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGrid>
          <Field label="Subscribers" value={formatNumber(data.subscriberCount)} />
          <Field label="Videos" value={formatNumber(data.videoCount)} />
          <Field label="Views" value={formatNumber(data.viewCount)} />
          <Field label="Has ads" value={<YesNo value={data.hasAds} />} />
          <Field label="Ad breaks" value={data.adBreakCount} />
          <Field label="Join button" value={<YesNo value={data.hasJoinButton} />} />
          <Field label="Made for kids" value={<YesNo value={data.isMadeForKids} />} />
          <Field label="Authentic" value={<YesNo value={data.isAuthentic} />} />
          <Field label="Country" value={orUnknown(data.channelCountry)} />
        </FieldGrid>

        {data.estimatedMonthlyEarnings || data.estimatedYearlyEarnings ? (
          <FieldGrid className="sm:grid-cols-2">
            <Field
              label="Est. monthly earnings"
              value={
                data.estimatedMonthlyEarnings
                  ? `${formatCurrency(data.estimatedMonthlyEarnings.min)} – ${formatCurrency(data.estimatedMonthlyEarnings.max)}`
                  : "Unknown"
              }
            />
            <Field
              label="Est. yearly earnings"
              value={
                data.estimatedYearlyEarnings
                  ? `${formatCurrency(data.estimatedYearlyEarnings.min)} – ${formatCurrency(data.estimatedYearlyEarnings.max)}`
                  : "Unknown"
              }
            />
          </FieldGrid>
        ) : null}

        {data.adTypes.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Ad types</p>
            <div className="flex flex-wrap gap-2">
              {data.adTypes.map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </div>
          </div>
        ) : null}

        {data.topicCategories.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Topics</p>
            <div className="flex flex-wrap gap-2">
              {data.topicCategories.map((t) => (
                <Badge key={t} variant="outline">{t}</Badge>
              ))}
            </div>
          </div>
        ) : null}

        {data.reasons.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              How we scored this
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {data.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
