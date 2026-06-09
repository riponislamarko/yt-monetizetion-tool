import type { TagExtractorResult } from "@yt/validators";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/tools/CopyButton";
import { Field, FieldGrid } from "@/components/tools/Field";
import { orUnknown } from "@/lib/utils";

export function TagExtractorResultView({ data }: { data: TagExtractorResult }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{orUnknown(data.title)}</CardTitle>
        <Badge variant="outline" className="w-fit capitalize">
          {data.type}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <FieldGrid>
          <Field label="Tags" value={data.tagCount} />
          <Field label="Characters" value={data.totalCharacters} />
          <Field
            label="Remaining"
            value={
              data.remainingCharacters === null
                ? "N/A"
                : `${data.remainingCharacters} / 500`
            }
          />
        </FieldGrid>

        {data.tags.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((t, i) => (
                <Badge key={`${t}-${i}`} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton value={data.copyableString} label="Copy all tags" />
              <span className="text-xs text-muted-foreground">
                Comma-separated, ready to paste.
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No tags found. This {data.type} may not expose any tags.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
