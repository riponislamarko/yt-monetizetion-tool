import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @yt/validators is consumed as TypeScript source (its package.json main points at
  // ./src/index.ts), so Next must transpile it.
  transpilePackages: ["@yt/validators"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
    ],
  },
  webpack: (config) => {
    // @yt/validators is NodeNext TS source using explicit ".js" import specifiers that map to
    // ".ts" files. Webpack doesn't apply that mapping by default, so teach it to.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

// next-intl "without routing": point the plugin at the request config.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const configWithIntl = withNextIntl(nextConfig);

// Only wrap with Sentry's build-time machinery when a DSN is configured. Without it we
// export the plain (intl-wrapped) config so no source-map upload / release plumbing runs
// at build time — keeping the no-op path fast and dependency-free.
const finalConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(configWithIntl, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      // Don't fail the build if upload auth is missing; runtime SDK still works.
      widenClientFileUpload: true,
      disableLogger: true,
    })
  : configWithIntl;

export default finalConfig;
