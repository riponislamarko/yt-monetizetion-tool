import { Link2, MousePointerClick, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/** "Enter URL → Pick a tool → Get results" — a connected 3-step process timeline. */
export function HowItWorks() {
  const t = useTranslations("Home");
  const steps = [
    { icon: Link2, title: t("step1Title"), body: t("step1Body") },
    { icon: MousePointerClick, title: t("step2Title"), body: t("step2Body") },
    { icon: Sparkles, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <section className="border-t border-border bg-muted/30">
      <div className="container py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {t("howEyebrow")}
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{t("howTitle")}</h2>
          <p className="mt-3 text-base text-muted-foreground">{t("howSub")}</p>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl">
          {/* Connector line behind the step markers (desktop only). */}
          <div
            aria-hidden
            className="absolute inset-x-[16%] top-8 hidden h-px bg-gradient-to-r from-border via-border to-border sm:block"
          />
          <ol className="grid gap-12 sm:grid-cols-3 sm:gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="group relative flex flex-col items-center text-center"
                >
                  <div className="relative z-10">
                    <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                      <Icon className="h-7 w-7" />
                    </span>
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow ring-2 ring-background">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
