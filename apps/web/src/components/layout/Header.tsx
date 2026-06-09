import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const t = useTranslations("Header");
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" aria-label={t("brand")} className="inline-flex items-center">
          <span className="inline-flex rounded-lg bg-white px-2.5 py-1.5 shadow-sm ring-1 ring-black/5">
            <Image
              src="/logo.png"
              alt={t("brand")}
              width={1448}
              height={332}
              priority
              className="h-6 w-auto sm:h-7"
            />
          </span>
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
