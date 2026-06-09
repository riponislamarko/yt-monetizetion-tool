import type { MoneyCalculatorResult } from "@yt/validators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGrid } from "@/components/tools/Field";
import { formatNumber, formatCurrency, orUnknown } from "@/lib/utils";

function Range({ min, avg, max }: { min: number; avg: number; max: number }) {
  return (
    <span>
      {formatCurrency(min)} – <strong>{formatCurrency(avg)}</strong> – {formatCurrency(max)}
    </span>
  );
}

export function MoneyCalculatorResultView({ data }: { data: MoneyCalculatorResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {data.channelTitle ? data.channelTitle : "Earnings estimate"}
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          {data.detectedNiche ? (
            <Badge variant="secondary" className="capitalize">
              {data.detectedNiche}
            </Badge>
          ) : null}
          {data.estimatedCountry ? (
            <Badge variant="outline">{data.estimatedCountry}</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGrid>
          <Field label="Monthly views" value={formatNumber(data.monthlyViews)} />
          <Field label="Subscribers" value={formatNumber(data.subscriberCount)} />
          <Field label="Total views" value={formatNumber(data.totalViews)} />
          <Field label="Country" value={orUnknown(data.estimatedCountry)} />
          <Field
            label="CPM (avg)"
            value={formatCurrency(data.cpmRange.avg)}
          />
          <Field
            label="RPM (avg)"
            value={formatCurrency(data.rpmRange.avg)}
          />
        </FieldGrid>

        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Per video</span>
            <Range {...data.earnings.perVideo} />
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Monthly</span>
            <Range {...data.earnings.monthly} />
          </div>
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="text-muted-foreground">Yearly</span>
            <Range {...data.earnings.yearly} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
      </CardContent>
    </Card>
  );
}
