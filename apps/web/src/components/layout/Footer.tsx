import Link from "next/link";
import { useTranslations } from "next-intl";
import { TOOLS } from "@/lib/tools";

export function Footer() {
  const t = useTranslations("Footer");
  const tt = useTranslations("Tools");
  return (
    <footer className="border-t border-border">
      <div className="container py-10">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <p className="font-semibold">{t("brand")}</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{t("tools")}</p>
            <ul className="mt-3 space-y-2">
              {TOOLS.slice(0, 4).map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={`/${tool.slug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {tt(`${tool.slug}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">{t("more")}</p>
            <ul className="mt-3 space-y-2">
              {TOOLS.slice(4).map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={`/${tool.slug}`}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {tt(`${tool.slug}.title`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>{t("disclaimer")}</p>
          <p className="mt-2">{t("copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
