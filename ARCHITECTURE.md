# Architecture

A production-oriented YouTube Toolkit (a feature clone of ytlarge.com) exposing 8 analysis
tools. This document records the data-source hierarchy, the hard constraints that shaped the
design, and every non-obvious decision.

```
                        ┌──────────────────────────────────────────┐
                        │                apps/web                   │
                        │   Next.js 14 (App Router) · Vercel        │
                        │   8 tool pages · TanStack Query · Tailwind│
                        └───────────────────┬──────────────────────┘
                                            │  POST /api/tools/*  (JSON envelope)
                                            ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │                               apps/api  (CONTAINER)                           │
   │  Fastify · Zod type provider (OpenAPI) · Pino · per-IP rate limit · Scalar    │
   │                                                                               │
   │   routes/tools/*  ─►  services/*  ─►  lib/youtube/*                           │
   │        │                  │              ├─ url-parser                        │
   │   cache.getOrSet          │              ├─ scrape  (cheerio)  ── PRIMARY     │
   │        │                  │              ├─ innertube (player/browse) PRIMARY │
   │   tool_lookups (FF)       │              ├─ classify · earnings              │
   │                           │              ├─ data-api (googleapis) ENRICHMENT  │
   │                           │              └─ quota-manager                     │
   │                           └─ playwright fallback (Chromium, on-demand only)   │
   └───────┬───────────────────────────┬───────────────────────────┬─────────────┘
           ▼                           ▼                           ▼
      PostgreSQL                     Redis                   YouTube (public web,
   (tool_lookups,            (cache · rate-limit ·           InnerTube, Data API v3)
    api_quota_usage)          live quota counters)
```

## 0. Data-source hierarchy (the most important fact)

**The official YouTube Data API v3 cannot detect monetization, ads, or shadowbans.** There is
no public `monetizationDetails` part on `videos.list`; monetization state is owner-only (OAuth
on your own channel). That part appears **nowhere** in this codebase — a Phase-1 quality gate.

So signals flow in a strict hierarchy:

1. **PRIMARY — truth for monetization/ad/shadowban signals: InnerTube + HTML scraping.**
   - `lib/youtube/scrape.ts` `extractAdSignals()` — **the ad/monetization signal** comes from
     the logged-out WATCH PAGE's `ytInitialPlayerResponse.adPlacements`. A monetized video
     reserves an ad slot (`clientForecastingAdRenderer`); a non-monetized/ads-off video has no
     `adPlacements` at all. For a channel we sample its latest upload. (See the WHY note below.)
   - `lib/youtube/innertube.ts` — InnerTube `browse` (topics, isFamilySafe) and a best-effort
     `player` call for metadata. **NOTE:** YouTube has hardened the InnerTube `player` endpoint
     — it now returns `UNPLAYABLE` with no ad data to unauthenticated clients (it wants a
     PoToken), so it is **no longer the ad source**; the watch-page method above replaced it.
     The old client-version constants are kept only for the metadata/fallback path.
   - `lib/youtube/scrape.ts` — fetches channel/watch pages and extracts
     `ytInitialData`/`ytInitialPlayerResponse`: subs, video count, join button, verified
     badge, country, keywords, avatar/banner, made-for-kids, handle/slug resolution.
   - `lib/youtube/classify.ts` — the monetization status engine (ported verbatim from the
     prototype's decision tree, with a continuous 0–100 score layered on top).

2. **ENRICHMENT — optional, only where the Data API is authoritative: Data API v3.**
   - Handle/username → channel ID resolution, canonical statistics, `status.madeForKids`,
     `topicDetails`, video `tags`, channel `keywords`. Used to corroborate and fill clean
     metadata — **never** to assert an ad/monetization signal.

When the two layers disagree on a monetization signal, **layer 1 wins**, and each result
records `signalSource` (`innertube | scrape | api | mixed | computed`). **The app fully
functions with zero Data API keys** — proven by the `__tests__/integration.test.ts` suite,
which runs entirely on the scraping layer.

> **Ad-detection WHY (updated after YouTube hardened InnerTube):** the prototype read ads from
> the InnerTube `player` endpoint's `adPlacements`. YouTube now returns `UNPLAYABLE` (no ad
> data) to unauthenticated clients there. The verified replacement is the logged-out **watch
> page** `ytInitialPlayerResponse.adPlacements`: monetized videos reserve an ad slot
> (`clientForecastingAdRenderer`), non-monetized ones reserve none. Channels are sampled via
> their latest upload. Parsing it needed a string-aware **brace-matcher** (the old
> `;</script>` slice over-captured trailing inline JS). When no player response is readable,
> ad-presence is `unknown` — never a false "not monetized" (§15 honesty gate).

## 1. ToS / legal stance & mitigations

Scraping and InnerTube use are outside YouTube's published ToS. This tool is built for
educational/analytical use, mirroring the publicly observable behavior of ytlarge.com. The
Data API path is fully ToS-compliant and is preferred wherever it is authoritative.

Mitigations implemented:
- **Conservative request rate with jitter** — `delayBetweenYoutubeRequests()` adds an
  800–1500 ms randomized delay between YouTube requests (disabled in the test env).
- **Aggressive caching** to minimize upstream requests (see §4).
- **Per-IP rate limiting** (§5).
- No authentication bypass; no download of copyrighted media beyond public thumbnail URLs
  (we serve direct `i.ytimg.com` links — we never proxy or store media).
- **Takedown / abuse contact**: documented in the README; add yours before deploying.

## 2. The 8 tools and their data sources

| Tool | Primary | Enrichment |
|------|---------|------------|
| monetization-checker | InnerTube player ads + channel scrape + classify | API stats / madeForKids / topics (corroborate only) |
| channel-id-finder | scrape handle/slug resolve | API forHandle / forUsername / channels.list |
| data-viewer | scrape + InnerTube | API video/channel parts |
| image-tool | scrape avatar/banner + HEAD-probe sizes | API snippet/branding image URLs |
| tag-extractor | scrape keywords/meta | API videos.list snippet.tags / branding keywords |
| money-calculator | scrape stats + ported earnings model | API canonical stats |
| shadowban-detector | cheap scrape signals | **gated** search.list (100 units) |
| thumbnail-downloader | deterministic `i.ytimg.com` URLs + HEAD probe | API video title/channel |

## 3. Quota strategy (`lib/youtube/quota-manager.ts`)

Relevant only when ≥1 Data API key is configured (`isEnabled()` is false with zero keys, and
every enrichment caller skips the API path cleanly).

- **Reserve-then-spend**: the per-key Redis counter `quota:{YYYY-MM-DD}:{keyIndex}` is
  incremented **before** the call so concurrent requests can't both believe budget remains.
- **Round-robin** across keys; a key is skipped if `projected + units > 9500` (buffer under
  the 10000 hard limit). On a `quotaExceeded` error a key is retired for the day and the next
  key is tried; non-quota errors propagate (units stay spent — conservative).
- **Cost table (enforced):** `channels.list = 1`, `videos.list = 1`, `search.list = 100`.
- **`search.list` is expensive (100 units)** and used only by the shadowban detector's
  search-visibility check, which is **gated**: it runs only when keys exist AND a key has
  ≥100 units of headroom; otherwise it is reported as `passed: null` ("skipped") with a
  reason in the UI — never silently dropped.
- **Durable rollup**: each increment write-through-upserts into `api_quota_usage`
  `(api_key_index, date)`; Redis holds the live counter, Postgres is the daily audit trail.

## 4. Caching & stampede control (`lib/cache.ts`)

- Cache key: `tool:{toolName}:{sha256(normalizedInputUrl)}`. Normalization lowercases the
  host, strips `www.` and tracking params, and drops fragments/trailing slashes so equivalent
  inputs share an entry. Bare IDs are lowercased (not coerced into URLs).
- **Fail-soft**: every method swallows Redis errors, logs once at warn, and behaves as a
  miss. **The app runs fully with Redis down.**
- **TTLs**: channel 3600 · video 1800 · images 86400 · earnings 3600 · tags 3600 ·
  shadowban 900 · monetization 1800 · thumbnails 86400.
- **Stampede control**: `getOrSet` takes a short `SET NX` (10 s) lock on a miss; losers wait
  briefly and re-read, so a cold key under load triggers one upstream fetch, not N.

## 5. Rate limiting, logging, health

- **Rate limiting**: per-IP, Redis-backed (`@fastify/rate-limit`), default 10 req/min. There
  is no auth system in Phase 1, so the "authenticated 60/min" tier and `rate_limit_overrides`
  are Phase 2 only. If Redis is down the limiter falls back to in-process LRU.
- **Logging**: Pino with request-id; secrets/headers redacted. Each tool request logs
  `tool_name, cached, signalSource, processingTimeMs, outcome`.
- **Health**: `/healthz` is always 200 if the process is up. `/readyz` pings DB (required) +
  Redis (optional) → 200 `ready`, 200 `degraded` (cache down), or 503 `unready` (DB down).
- **Graceful shutdown**: on SIGTERM/SIGINT we close Fastify (drains in-flight), drain the
  Playwright pool, end the PG pool, and disconnect Redis.

## 6. Scraping → Playwright fallback (`lib/playwright.ts`)

A headless-Chromium pool (singleton browser, max 2 contexts, idle-close) used **only** when
InnerTube + cheerio cannot extract a required signal from a heavily client-rendered surface.
It is **not** the default path — the 8 tools today are served by `fetch` + cheerio + InnerTube
and never touch it. `playwright-core` is imported lazily; a failed launch degrades to
"fallback unavailable" rather than crashing.

**Deployment consequence:** Chromium cannot run on Vercel/Lambda-style serverless. Therefore
**apps/api deploys as a long-running container** (Railway/Fly/Render) built from the
`mcr.microsoft.com/playwright` base image; only **apps/web (no browser) deploys to Vercel.**
The CI deploy job reflects this split.

BullMQ (offloading fallback scrapes to a worker) is intentionally **omitted** — no measured
need. Ship no idle queue infrastructure.

## 7. Reasonable decisions made (and why)

- **Internal packages are consumed as TS source** (their `main` points at `src/index.ts`).
  The API therefore runs in production via **`tsx`** (`pnpm --filter @yt/api start`) rather
  than a compiled `dist`, and the web app uses `transpilePackages`. This avoids a
  build/publish step for internal-only packages. `tsc -p tsconfig.build.json` still runs in CI
  as a typecheck/emit gate. Trade-off: a tiny `tsx` startup cost vs. much simpler wiring.
- **One canonical CPM table** (`earnings.ts` `CPM_BY_COUNTRY`, min/avg/max tiers) reconciles
  the prototype's flat `CPM_USD`. RPM is modelled as ~45% of CPM; niche multipliers and
  ranges follow CLAUDE.md §8. The prototype's divergent table is retired.
- **No fabricated fields.** Anything the data layers can't reliably produce (exact view
  counts without the API, channel age without `publishedAt`, etc.) is `null` and surfaced as
  "Unknown". Earnings are emitted only when a monthly-views figure can actually be derived.
- **`classify.ts` preserves the prototype's decision tree verbatim** (the parity test asserts
  the exact statuses/confidences) and layers a continuous 0–100 score on top for the UI gauge.
- **The tool-route factory** bypasses the Zod type-provider's handler-return inference (which
  fights a generic factory across multiple declared status codes); the Zod schemas still drive
  runtime validation and the OpenAPI spec, and `req.body` is cast explicitly.

## 8. Secret rotation

- Never log secret values; never commit a real `.env`. In prod, load from the platform secret
  store (Railway/Vercel env).
- **Rotating a Data API key**: swap the env var value (`YOUTUBE_API_KEY_n`). Quota counters
  are keyed by **index** (`quota:{date}:{n}`), not by the key value, so rotation is transparent
  to the quota manager — no counter reset, no code change.
- Rotating `IP_HASH_SALT` re-anonymizes future rows; historical `ip_hash` values become
  non-correlatable, which is acceptable (and arguably desirable) for a privacy-preserving log.

## 9b. Phase 2 integrations (all no-op when unconfigured)

The governing rule (§1): a missing optional integration degrades gracefully and logs ONE
info line — never crashes, never 500s. Every Phase-2 piece is gated on its env var, so the
app's default state (all Phase-2 env empty) is exactly the Phase-1 behavior. Verified by the
test suite and a Redis-down production boot.

| Integration | Where | Enabled by | Disabled behavior |
|-------------|-------|-----------|-------------------|
| **Sentry** (errors) | api + web | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | `init` never called; `reportException` short-circuits; web build skips source-map upload |
| **Axiom** (logs) | api | `AXIOM_TOKEN` + `AXIOM_DATASET` | `@axiomhq/pino` transport target never added; plain stdout |
| **Arcjet** (bot/abuse) | api | `ARCJET_KEY` | no `onRequest` hook registered; fail-OPEN even when enabled |
| **PostHog** (analytics) | web | `NEXT_PUBLIC_POSTHOG_KEY` | `init` never called; `capture()` is a safe no-op |
| **next-intl** (i18n) | web | always (EN only) | not an external integration; "without routing" mode, routes untouched |
| **Framer Motion** | web | always | reduced-motion-aware; lightweight |
| **Admin overrides** | api | `ADMIN_API_KEY` (min 16) | `/api/admin/*` routes not registered (404) |

- **Arcjet** sits in front of the per-IP limiter as an `onRequest` hook (shield + bot
  detection, allowing search engines + uptime monitors). It **fails open**: a backend hiccup
  logs at debug and allows the request. Health checks are never gated.
- **Rate-limit overrides** (`rate_limit_overrides` table): the admin route (bearer-token auth
  via `ADMIN_API_KEY` — the minimal auth decision §6 requires) writes a durable row AND mirrors
  the value into Redis (`rl:override:{ipHash}`). The limiter's per-request `max` reads that
  override (fail-soft → default cap on Redis error), so trusted IPs get a raised cap. Overrides
  accept a raw IP (hashed here, never stored raw) or a precomputed `ipHash`.
- **Limiter degrade-open fix:** `@fastify/rate-limit` is configured `skipOnError: true` so that
  when its Redis store is unreachable the request is *allowed* rather than 500'd — required by
  §15 (the app must fully function with Redis down). Trade-off: limiting is unenforced while
  Redis is down.

## 10. Intentionally omitted (per spec guidance)

- **BullMQ** — §7 says build the offloaded-scraping worker only on a *measured* need; there is
  none (the 8 tools are served by fetch + cheerio + InnerTube and never touch the Playwright
  fallback under normal load). Shipping idle queue infra is explicitly discouraged, so it is
  omitted. Re-introduce only if Playwright-fallback latency becomes a measured problem.
- **Cloudflare R2** — §8 (Tool 8) justifies R2 only if a durable zip-bundle download feature
  lands. We serve thumbnails as direct `i.ytimg.com` links (no proxy/store), so there is no
  durable-storage need, and storing media adds cost + copyright exposure. Omitted; the R2 env
  vars remain reserved for if/when a zip feature is added behind them.

## 11. Data retention

`tool_lookups` stores only public URLs and a salted SHA-256 IP hash — no PII. A purge
(`pnpm --filter @yt/db purge`, default 90 days via `LOOKUP_RETENTION_DAYS`) is provided for a
daily cron. The window is documented in the README.
```
