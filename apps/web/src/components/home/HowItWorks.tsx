import { Link2, MousePointerClick, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

/** "Enter URL → Pick a tool → Get results" — the 3-step process strip from ytlarge.com. */
export function HowItWorks() {
  const t = useTranslations("Home");
  const steps = [
    { icon: Link2, title: t("step1Title"), body: t("step1Body") },
    { icon: MousePointerClick, title: t("step2Title"), body: t("step2Body") },
    { icon: Sparkles, title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <section className="border-t border-border bg-muted/30">
      <div className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("howTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("howSub")}</p>
        </div>
        <ol className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="relative rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
              >
                <span className="absolute right-4 top-4 text-2xl font-extrabold text-primary/15">
                  {i + 1}
                </span>
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
