# YouTube Toolkit

A production-oriented, full-stack YouTube analysis toolkit — a feature clone of ytlarge.com
with **8 tools**: Monetization Checker, Channel ID Finder, Data Viewer, Image Tool, Tag
Extractor, Money Calculator, Shadowban Detector, and Thumbnail Downloader.

> **How it works (read this first):** the official YouTube Data API v3 **cannot** detect
> monetization, ads, or shadowbans. Those signals are derived from YouTube's private InnerTube
> endpoints + page scraping; the Data API is an **optional enrichment** layer. **The app runs
> fully without any API keys.**

## Stack

| Layer | Tech |
|-------|------|
| Web (`apps/web`) | Next.js 14 (App Router), TypeScript, Tailwind, TanStack Query, next-themes |
| API (`apps/api`) | Fastify 4, Zod + OpenAPI (Scalar), Pino, cheerio, InnerTube, googleapis, Playwright fallback |
| Data | PostgreSQL (Drizzle ORM), Redis (cache · rate limit · quota counters) |
| Shared | `@yt/validators` (Zod + types), `@yt/db` (schema/migrations), `@yt/config` (tsconfig base) |
| Tooling | Turborepo + pnpm workspaces, Vitest + MSW, Playwright E2E |

## Prerequisites

- **Node 20+** and **pnpm 9** (`corepack enable`).
- **PostgreSQL 16** and **Redis 7** running locally. Install them with your OS package
  manager — e.g. macOS: `brew install postgresql@16 redis && brew services start postgresql@16 && brew services start redis`;
  Ubuntu: `sudo apt install -y postgresql redis-server`.

## Local setup (from scratch)

```bash
# 1. Install dependencies
pnpm install

# 2. Make sure Postgres + Redis are running, then create the database
createdb yttoolkit        # or: psql -c "CREATE DATABASE yttoolkit;"

# 3. Configure env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
#   → set DATABASE_URL + REDIS_URL to your local instances
#   → set IP_HASH_SALT to a long random string (openssl rand -hex 32)
#   → Data API keys are OPTIONAL.

# 4. Migrate the database (migrations are checked into packages/db/drizzle)
pnpm --filter @yt/db migrate

# 5. Run everything
pnpm dev            # turbo runs web (:3000) + api (:3001)
```

- API docs (OpenAPI / Scalar): http://localhost:3001/api/docs
- Health: http://localhost:3001/healthz · Readiness: http://localhost:3001/readyz

## YouTube Data API keys (optional enrichment)

The app serves all 8 tools **with zero keys** (scraping layer). To add the ToS-compliant
enrichment layer (cleaner stats, handle resolution, tags, and the shadowban search-visibility
check), create API keys in Google Cloud Console (enable *YouTube Data API v3*) and set
`YOUTUBE_API_KEY_1..5` in `apps/api/.env`. Up to 5 keys are round-robined; each gets a 9500
unit/day budget (buffer under the 10000 hard limit). **Monetization/ad/shadowban signals never
come from the Data API** — keys only enrich.

## Production setup

The whole stack is plain Node.js, so it deploys to a single VPS with system-installed Postgres,
Redis, a process manager (PM2 or systemd), and Nginx for HTTPS.

- **Postgres & Redis** — install and run them on the host (or use managed services such as
  [Neon](https://neon.tech) for Postgres and [Upstash](https://upstash.com) for Redis). Put the
  connection strings in `DATABASE_URL` / `REDIS_URL`. The app still runs if Redis is down —
  cache is fail-soft.
- **Build the web app** — `NEXT_PUBLIC_API_URL` is inlined at build time:
  `NEXT_PUBLIC_API_URL=https://yourdomain.com pnpm --filter @yt/web build`.
- **Run the processes** — the API runs from TypeScript source via `tsx` (no build step); the web
  runs `next start`. Manage both with PM2 (`pm2 start ecosystem.config.cjs`) or systemd units.
- **Reverse proxy** — Nginx proxies `/api/*` to the API (:3001) and everything else to the web
  (:3000); add HTTPS with certbot (Let's Encrypt).
- **Migrations** — run `pnpm --filter @yt/db migrate` as a deploy step before the API starts.

> **Playwright note:** the API uses a headless-Chromium fallback for a few hard-to-scrape
> surfaces. It is **optional** — all 8 tools work without it. For full fidelity install the
> browser once with `npx playwright@1.49.1 install --with-deps chromium`.

## Tests

```bash
pnpm test           # Vitest unit + integration (incl. the zero-Data-API-keys suite)
pnpm typecheck      # tsc --noEmit across all packages
pnpm build          # turbo build
```

The integration suite (`apps/api/src/__tests__`) mocks both InnerTube/HTML and the Data API
with MSW across three files: the **zero-keys** suite (proves every tool works on the scraping
layer alone), the **error-mapping** suite (every typed error → correct status + envelope), and
the **Data-API-keys-configured** suite (proves the enrichment path and `signalSource: 'api'`).
Plus a Phase-2 **admin** suite. 75 unit + integration tests in total. E2E happy paths live in
`tests/e2e/` (`pnpm test:e2e`).

### Phase 2 integrations (all optional, no-op when unconfigured)

Sentry (errors, api + web), Axiom (log shipping, api), Arcjet (bot/abuse, api), PostHog
(analytics, web), next-intl (EN i18n, web), Framer Motion (web), and an `ADMIN_API_KEY`-gated
admin route for per-IP rate-limit overrides. Each degrades gracefully — the app's default
state (all Phase-2 env empty) is exactly the Phase-1 behavior. **BullMQ and Cloudflare R2 are
intentionally omitted.**

## Data retention & privacy

`tool_lookups` stores only public URLs and a **salted SHA-256 IP hash** — no PII. Purge old
rows on a daily cron:

```bash
LOOKUP_RETENTION_DAYS=90 pnpm --filter @yt/db purge
```

The default retention window is **90 days**.

## Abuse / takedown contact

This tool accesses publicly available YouTube data for educational/analytical use. For
takedown or abuse reports, contact: **<add-your-contact-email-before-deploying>**.

## Repository layout

```
apps/web      Next.js frontend (8 tool pages)
apps/api      Fastify backend (routes · services · lib/youtube · plugins)
packages/db   Drizzle schema + migrations + purge
packages/validators  Zod schemas + typed errors + shared result types
packages/config      Shared tsconfig bases
tests/e2e     Playwright end-to-end happy-path specs
```

## License / disclaimer

Earnings figures are rough model-based estimates, not guarantees. Monetization/shadowban
results are heuristic signals derived from public data, not official YouTube determinations.
