"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { TOOLS, type ToolMeta } from "@/lib/tools";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Categorized, stagger-fade-in grid of the 8 tool cards, mirroring ytlarge.com's
 * primary/secondary split. Honours prefers-reduced-motion. */
export function ToolGrid() {
  const t = useTranslations("Home");
  const primary = TOOLS.filter((tool) => tool.category === "primary");
  const secondary = TOOLS.filter((tool) => tool.category === "secondary");

  return (
    <div className="space-y-14">
      <ToolSection
        heading={t("primaryHeading")}
        sub={t("primarySub")}
        tools={primary}
      />
      <ToolSection
        heading={t("secondaryHeading")}
        sub={t("secondarySub")}
        tools={secondary}
      />
    </div>
  );
}

function ToolSection({
  heading,
  sub,
  tools,
}: {
  heading: string;
  sub: string;
  tools: ToolMeta[];
}) {
  const t = useTranslations("Home");
  const tt = useTranslations("Tools");
  const reduce = useReducedMotion();

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.06 } },
  };
  const item = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : {
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
      };

  return (
    <section>
      <div className="mb-5">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{heading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      </div>
      <motion.div
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <motion.div key={tool.slug} variants={item}>
              <Link href={`/${tool.slug}`} className="group block h-full">
                <Card className="flex h-full flex-col rounded-2xl transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 dark:bg-primary/20 dark:ring-primary/30">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {t("category")}
                      </span>
                    </div>
                    <CardTitle className="mt-4">{tt(`${tool.slug}.title`)}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="text-sm text-muted-foreground">
                      {tt(`${tool.slug}.short`)}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Open tool
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
