import Link from "next/link";
import { useTranslations } from "next-intl";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const t = useTranslations("Header");
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Logo className="h-8 w-8" />
          <span className="text-lg tracking-tight sm:text-xl">{t("brand")}</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
          >
            {t("allTools")}
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
