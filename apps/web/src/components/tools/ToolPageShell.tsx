import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTool, relatedTools, type ToolMeta } from "@/lib/tools";

/** Page chrome shared by every tool page: hero header + related-tools footer. */
export function ToolPageShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const tool = getTool(slug) as ToolMeta;
  const Icon = tool.icon;
  const related = relatedTools(slug);

  return (
    <div className="container py-10 sm:py-14">
      <div className="mb-8 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/20 dark:ring-primary/30">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{tool.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{tool.description}</p>
        </div>
      </div>

      {children}

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Related tools
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {related.map((t) => {
            const RIcon = t.icon;
            return (
              <Link
                key={t.slug}
                href={`/${t.slug}`}
                className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
              >
                <RIcon className="h-5 w-5 text-primary" />
                <span className="flex-1 text-sm font-medium">{t.title}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
