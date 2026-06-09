import type { ShadowbanResult } from "@yt/validators";
import Image from "next/image";
import { Check, X, MinusCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, orUnknown } from "@/lib/utils";

const STATUS: Record<
  ShadowbanResult["shadowbanStatus"],
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  clean: { label: "Clean", variant: "success" },
  partial: { label: "Partial signals", variant: "warning" },
  likely: { label: "Likely shadowbanned", variant: "warning" },
  shadowbanned: { label: "Shadowbanned", variant: "destructive" },
};

const CHECK_LABELS: Record<keyof ShadowbanResult["checks"], string> = {
  searchVisibility: "Search visibility",
  channelPublicStatus: "Channel public",
  subscriberVisibility: "Subscriber count visible",
  madeForKids: "Not made-for-kids limited",
  searchIndexed: "Search indexed",
};

function CheckRow({
  label,
  passed,
  details,
}: {
  label: string;
  passed: boolean | null;
  details: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border p-3">
      <span className="mt-0.5 shrink-0">
        {passed === null ? (
          <MinusCircle className="h-5 w-5 text-muted-foreground" />
        ) : passed ? (
          <Check className="h-5 w-5 text-emerald-500" />
        ) : (
          <X className="h-5 w-5 text-destructive" />
        )}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {label}
          {passed === null ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">(skipped)</span>
          ) : null}
        </p>
        <p className="text-sm text-muted-foreground">{details}</p>
      </div>
    </div>
  );
}

export function ShadowbanResultView({ data }: { data: ShadowbanResult }) {
  const status = STATUS[data.shadowbanStatus];
  const checkKeys = Object.keys(data.checks) as Array<keyof ShadowbanResult["checks"]>;

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
            <p className="text-sm text-muted-foreground">
              {formatNumber(data.subscriberCount)} subscribers
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <Badge variant="outline">Score {data.shadowbanScore}/100</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {checkKeys.map((key) => {
            const c = data.checks[key];
            return (
              <CheckRow
                key={key}
                label={CHECK_LABELS[key]}
                passed={c.passed}
                details={c.details}
              />
            );
          })}
        </div>

        {data.recommendations.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Recommendations
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {data.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
