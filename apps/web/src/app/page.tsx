import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { ToolGrid } from "@/components/home/ToolGrid";
import { HeroSearch } from "@/components/home/HeroSearch";
import { HowItWorks } from "@/components/home/HowItWorks";

export const metadata: Metadata = {
  title: "TubeIntel — Free YouTube Analytics Tools",
  description:
    "8 free tools for YouTube creators and analysts: monetization checker, channel ID finder, data viewer, image tool, tag extractor, money calculator, shadowban detector and thumbnail downloader.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const t = useTranslations("Home");
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Soft red brand glow behind the hero (design.md primary accent). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-[-30%] mx-auto h-[420px] max-w-3xl rounded-full bg-primary/10 blur-3xl"
        />
        <div className="container relative py-20 text-center sm:py-28">
          <p className="mx-auto mb-5 w-fit rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("badge")}
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            {t("heroSubtitle")}
          </p>
          <HeroSearch />
        </div>
      </section>

      {/* Tool grid (categorized, animated) */}
      <section className="container py-16">
        <ToolGrid />
      </section>

      {/* How it works */}
      <HowItWorks />
    </div>
  );
}
