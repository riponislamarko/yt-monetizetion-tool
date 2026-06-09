"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Calculator, Link as LinkIcon } from "lucide-react";
import type { MoneyCalculatorResult } from "@yt/validators";
import { youtubeUrlSchema } from "@yt/validators";
import { useToolQuery } from "@/hooks/useToolQuery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingSkeleton } from "@/components/tools/LoadingSkeleton";
import { ErrorState } from "@/components/tools/ErrorState";
import { ResultMeta } from "@/components/tools/ResultMeta";
import { MoneyCalculatorResultView } from "@/components/tools/results/MoneyCalculatorResultView";
import { cn } from "@/lib/utils";

const NICHES = [
  "finance",
  "tech",
  "business",
  "health",
  "education",
  "lifestyle",
  "gaming",
  "entertainment",
  "comedy",
  "kids",
] as const;

// A short list of common countries; backend defaults to global CPM for others.
const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
];

const urlSchema = z.object({ url: youtubeUrlSchema });
type UrlForm = z.infer<typeof urlSchema>;

const manualSchema = z.object({
  // `valueAsNumber` on the input produces a number (or NaN when empty); validate as such.
  monthlyViews: z
    .number({ invalid_type_error: "Enter a number." })
    .int()
    .nonnegative("Enter a non-negative number."),
  niche: z.enum(NICHES),
  country: z.string().regex(/^[A-Za-z]{2}$/),
});
type ManualForm = z.infer<typeof manualSchema>;

type Mode = "url" | "manual";

export function Client() {
  const [mode, setMode] = React.useState<Mode>("url");
  const mutation = useToolQuery<MoneyCalculatorResult>("money-calculator");
  const lastBody = React.useRef<Record<string, unknown> | null>(null);

  const urlForm = useForm<UrlForm>({ resolver: zodResolver(urlSchema), mode: "onChange" });
  const manualForm = useForm<ManualForm>({
    resolver: zodResolver(manualSchema),
    mode: "onChange",
    defaultValues: { niche: "tech", country: "US" },
  });

  const submit = (body: Record<string, unknown>) => {
    lastBody.current = body;
    mutation.mutate(body);
  };

  const result = mutation.data;

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-border p-1">
        <button
          type="button"
          onClick={() => setMode("url")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "url" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          <LinkIcon className="h-4 w-4" /> From URL
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          <Calculator className="h-4 w-4" /> Manual
        </button>
      </div>

      {mode === "url" ? (
        <form
          onSubmit={urlForm.handleSubmit((v) => submit({ url: v.url.trim() }))}
          className="space-y-2"
          noValidate
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              {...urlForm.register("url")}
              placeholder="Paste a channel or video URL…"
              autoComplete="off"
              spellCheck={false}
              className="flex-1"
              aria-label="YouTube URL"
            />
            <Button type="submit" disabled={mutation.isPending || !urlForm.formState.isValid}>
              {mutation.isPending ? "Calculating…" : "Calculate"}
            </Button>
          </div>
          {urlForm.formState.errors.url ? (
            <p className="text-sm text-destructive">
              {urlForm.formState.errors.url.message}
            </p>
          ) : null}
        </form>
      ) : (
        <form
          onSubmit={manualForm.handleSubmit((v) =>
            submit({
              monthlyViews: v.monthlyViews,
              niche: v.niche,
              country: v.country.toUpperCase(),
            }),
          )}
          className="space-y-4"
          noValidate
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="mb-1 block text-sm font-medium">Monthly views</label>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="100000"
                {...manualForm.register("monthlyViews", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Niche</label>
              <Select {...manualForm.register("niche")}>
                {NICHES.map((n) => (
                  <option key={n} value={n} className="capitalize">
                    {n}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Country</label>
              <Select {...manualForm.register("country")}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {manualForm.formState.errors.monthlyViews ? (
            <p className="text-sm text-destructive">
              {manualForm.formState.errors.monthlyViews.message}
            </p>
          ) : null}
          <Button type="submit" disabled={mutation.isPending || !manualForm.formState.isValid}>
            {mutation.isPending ? "Calculating…" : "Calculate earnings"}
          </Button>
        </form>
      )}

      {mutation.isPending ? <LoadingSkeleton /> : null}

      {mutation.isError && !mutation.isPending ? (
        <ErrorState
          error={mutation.error}
          onRetry={lastBody.current ? () => submit(lastBody.current as Record<string, unknown>) : undefined}
        />
      ) : null}

      {result && !mutation.isPending && !mutation.isError ? (
        <div className="space-y-3">
          <ResultMeta
            cached={result.cached}
            signalSource={result.signalSource}
            processingTimeMs={result.processingTimeMs}
          />
          <MoneyCalculatorResultView data={result.data} />
        </div>
      ) : null}
    </div>
  );
}
