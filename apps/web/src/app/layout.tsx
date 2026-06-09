import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

// Poppins is the brand primary per the design system (design.md).
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TubeIntel — Free YouTube Analytics Tools",
    template: "%s | TubeIntel",
  },
  description:
    "Free YouTube tools: monetization checker, channel ID finder, tag extractor, money calculator, shadowban detector, thumbnail downloader and more.",
  applicationName: "TubeIntel",
  openGraph: {
    type: "website",
    siteName: "TubeIntel",
    title: "TubeIntel — Free YouTube Analytics Tools",
    description:
      "A free suite of analytics tools for YouTube channels and videos.",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // EN-only (no i18n routing); messages come from src/i18n/request.ts.
  const messages = await getMessages();

  return (
    <html lang="en" suppressHydrationWarning className={poppins.variable}>
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider locale="en" messages={messages}>
          <Providers>
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <Footer />
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
