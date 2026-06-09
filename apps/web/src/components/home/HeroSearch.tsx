"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { TOOLS, type ToolMeta } from "@/lib/tools";

/** Central hero input, mirroring ytlarge.com's "paste a URL" entry point.
 * The user pastes a URL and picks a tool from the dropdown; submitting routes to
 * /<tool-slug>?url=… (defaults to the Monetization Checker when no tool is chosen). */
export function HeroSearch() {
  const t = useTranslations("Home");
  const router = useRouter();
  const [value, setValue] = useState("");
  const [tool, setTool] = useState<ToolMeta | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the tool dropdown on an outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const slug = tool?.slug ?? "monetization-checker";
    const url = value.trim();
    router.push(url ? `/${slug}?url=${encodeURIComponent(url)}` : `/${slug}`);
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-10 w-full max-w-3xl">
      <div className="flex items-stretch gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-md focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring/30">
        <input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="h-12 min-w-0 flex-1 bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground sm:text-base"
        />

        {/* Select Tool dropdown */}
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex h-12 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 sm:px-4 dark:bg-zinc-800 dark:hover:bg-zinc-700"
          >
            <span className="max-w-[7rem] truncate sm:max-w-[10rem]">
              {tool ? tool.title : t("selectTool")}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>

          {open && (
            <div
              role="listbox"
              className="absolute right-0 z-50 mt-2 max-h-80 w-64 overflow-auto rounded-xl border border-border bg-card p-1 shadow-lg"
            >
              {TOOLS.map((tm) => {
                const Icon = tm.icon;
                const active = tool?.slug === tm.slug;
                return (
                  <button
                    key={tm.slug}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setTool(tm);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent ${
                      active ? "bg-accent font-medium" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate">{tm.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Search / submit */}
        <button
          type="submit"
          aria-label={t("searchButton")}
          className="flex h-12 shrink-0 items-center justify-center rounded-xl bg-zinc-700 px-4 text-white transition-colors hover:bg-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-zinc-600 dark:hover:bg-zinc-500"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("searchHint")}</p>
    </form>
  );
}
