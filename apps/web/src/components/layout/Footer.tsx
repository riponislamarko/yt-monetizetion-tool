import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { TOOLS } from "@/lib/tools";

export function Footer() {
  const t = useTranslations("Footer");
  const tt = useTranslations("Tools");
  const year = new Date().getFullYear();

  const linkClass =
    "text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <footer className="border-t border-border bg-muted/30">
      <div className="container py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-12">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-4">
            <Link href="/" aria-label={t("brand")} className="inline-flex">
              <span className="inline-flex rounded-lg bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
                <Image
                  src="/logo.png"
                  alt={t("brand")}
                  width={1448}
                  height={332}
                  className="h-7 w-auto"
                />
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              {t("tagline")}
            </p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("badge")}
            </span>
          </div>

          {/* Tools */}
          <nav className="lg:col-span-3" aria-label={t("tools")}>
            <p className="text-sm font-semibold">{t("tools")}</p>
            <ul className="mt-4 space-y-2.5">
              {TOOLS.slice(0, 4).map((tool) => (
                <li key={tool.slug}>
                  <Link href={`/${tool.slug}`} className={linkClass}>
                    {tt(`${tool.slug}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* More */}
          <nav className="lg:col-span-3" aria-label={t("more")}>
            <p className="text-sm font-semibold">{t("more")}</p>
            <ul className="mt-4 space-y-2.5">
              {TOOLS.slice(4).map((tool) => (
                <li key={tool.slug}>
                  <Link href={`/${tool.slug}`} className={linkClass}>
                    {tt(`${tool.slug}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Resources */}
          <nav className="lg:col-span-2" aria-label={t("resources")}>
            <p className="text-sm font-semibold">{t("resources")}</p>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link href="/" className={linkClass}>
                  {t("allTools")}
                </Link>
              </li>
              <li>
                <a href="mailto:contact@devarko.xyz" className={linkClass}>
                  {t("contact")}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t("copyright", { year })}
          </p>
          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-right">
            {t("disclaimer")}
          </p>
        </div>
      </div>
    </footer>
  );
}
