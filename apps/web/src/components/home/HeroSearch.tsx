"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

/** Central hero input, mirroring ytlarge.com's "paste a URL" entry point.
 * Submitting routes to the Monetization Checker with the URL prefilled via ?url=. */
export function HeroSearch() {
  const t = useTranslations("Home");
  const router = useRouter();
  const [value, setValue] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = value.trim();
    const target = url
      ? `/monetization-checker?url=${encodeURIComponent(url)}`
      : "/monetization-checker";
    router.push(target);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-8 w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30">
        <span className="pl-2 text-muted-foreground">
          <Search className="h-5 w-5" />
        </span>
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-10 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground sm:text-base"
        />
        <button
          type="submit"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t("searchButton")}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">{t("searchHint")}</p>
    </form>
  );
}
