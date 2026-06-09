import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (§12). Drives the running web app (and, through it, the API). The webServer
 * block boots the whole stack via `turbo dev` and waits for the homepage. Set
 * NEXT_PUBLIC_API_URL / the API env in your shell before running so the API is reachable.
 */
export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --dir ../.. dev",
        url: "http://localhost:3000",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
