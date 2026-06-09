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
        <div className="container relative py-24 text-center sm:py-32">
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            {t("heroTitleLead")} <span className="text-primary">{t("heroTitleAccent")}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
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
