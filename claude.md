You are an expert full-stack engineer and system architect. Build a production-ready, enterprise-grade YouTube Toolkit web application — a feature-complete clone of ytlarge.com.

Read this entire document before writing any code. It encodes hard-won architectural decisions; the "WHY" notes are not optional context — they prevent you from building a tool that returns confidently wrong answers.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
0. GROUND TRUTH — READ FIRST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A working prototype already exists in this repo at the root (`server.js`, `public/index.html`, `src/`). It is the source of truth for HOW YouTube data is actually obtained. You will PORT and HARDEN this logic, not re-derive it.

The single most important architectural fact:

  ▶ The official YouTube Data API v3 CANNOT detect monetization, ads, or shadowbans.
    There is NO public `monetizationDetails` part on `videos.list`. Monetization
    state is owner-only (OAuth on your own channel). Any public monetization checker
    MUST derive signals from page scraping + the InnerTube private endpoints.

Therefore this is the data-source hierarchy for the whole system:

  1. PRIMARY (truth for monetization/ads/shadowban signals): InnerTube + HTML scraping.
     Already implemented in `src/innertube.js` and `src/scrapeYoutube.js`:
       - InnerTube `player` endpoint → adPlacements, playerAds, ad break offsets, ad tokens
       - InnerTube `browse` endpoint → channel topics, isFamilySafe
       - HTML scrape of channel/watch pages → ytInitialData/ytInitialPlayerResponse:
         subscriber count, video count, join button, verified badge, country, keywords,
         avatar/banner, made-for-kids flag, handle/slug resolution
     Monetization classification logic lives in `src/monetizationLogic.js`.
     Earnings model lives in `src/earnings.js`.

  2. ENRICHMENT / VERIFICATION (optional, when keys are configured): YouTube Data API v3.
     Used ONLY for clean, structured, ToS-blessed metadata where it is authoritative:
       - Resolving channel IDs from handles/usernames (channels.list forHandle/forUsername)
       - Canonical channel/video statistics, snippet, status.madeForKids, topicDetails
       - Tags (videos.list snippet.tags), channel keywords (brandingSettings)
     The Data API is an ENRICHMENT layer. If no API keys are configured the app MUST
     still fully function using the scraping layer alone. The Data API never overrides
     a monetization/ad signal — those come only from layer 1.

  When the two layers disagree on a monetization signal, layer 1 (InnerTube/scrape) wins
  and the response records `signalSource: 'innertube' | 'scrape' | 'api'` per field.

WHY: A monetization checker built on the Data API "monetizationDetails" part will not
compile against the real API and, if forced, returns garbage. The prototype already
proves the scraping approach works. Do not regress it.

LEGAL / ToS STANCE (document this in ARCHITECTURE.md):
  - Scraping and InnerTube use are outside YouTube's published ToS. This tool is built
    for educational/analytical use, mirroring publicly available behavior of ytlarge.com.
  - Mitigations REQUIRED: conservative request rates with jitter (already in
    `delayBetweenYoutubeRequests`), aggressive caching to minimize requests, no
    authentication-bypass, no download of copyrighted media beyond public thumbnails,
    a documented takedown/abuse contact, and per-IP rate limiting.
  - The Data API path is fully ToS-compliant; prefer it whenever it is authoritative.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SCOPE & PHASING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build in two phases. Phase 1 must be fully working and deployable on its own. Do not
start Phase 2 work before Phase 1 passes all its quality gates.

PHASE 1 — Core product (MVP, must ship):
  - Monorepo scaffold (apps/web, apps/api, packages: db, validators, config)
  - Ported & hardened scraping/InnerTube layer + Data API enrichment client
  - All 8 tools: route + service + frontend page
  - Redis cache layer, per-IP rate limiting, structured logging, error envelope
  - Postgres persistence (tool_lookups, api_quota_usage) + migrations
  - Health/readiness endpoints, OpenAPI docs, Docker Compose, CI, README + ARCHITECTURE
  - Unit + integration tests for the critical libs and routes

PHASE 2 — Scale & polish (only after Phase 1 is green):
  - i18n (next-intl), Framer Motion transitions, PostHog analytics
  - Sentry, Axiom log transport, Arcjet edge bot protection
  - Cloudflare R2 (ONLY if a feature needs durable file storage — see Tool 8 note)
  - BullMQ workers (ONLY for the offloaded-scraping design in §7; otherwise omit)
  - rate_limit_overrides admin (requires the auth decision in §6)

If a Phase 2 dependency is not configured via env, the app must degrade gracefully and
log a single info-level line — never crash, never 500 on a missing optional integration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. MONOREPO STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Turborepo monorepo with pnpm workspaces:

yt-toolkit/
├── apps/
│   ├── web/          # Next.js 14 frontend (App Router)
│   └── api/          # Fastify backend (+ optional worker entrypoint, Phase 2)
├── packages/
│   ├── ui/           # Shared shadcn/ui components (Phase 1: minimal; grow as needed)
│   ├── db/           # Drizzle ORM schema + migrations
│   ├── validators/   # Shared Zod schemas + typed error classes
│   └── config/       # Shared TS, ESLint, Tailwind, tsconfig bases
├── turbo.json
├── pnpm-workspace.yaml
└── docker-compose.yml

Migration of the prototype: move `src/innertube.js`, `src/scrapeYoutube.js`,
`src/parseUrl.js`, `src/monetizationLogic.js`, `src/earnings.js` into
`apps/api/src/lib/youtube/` and `apps/api/src/services/`, converting to TypeScript with
strict types. Preserve their behavior; add types and tests around them. Keep the legacy
root files until parity tests pass, then delete them.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Frontend (apps/web) — Phase 1:
- Next.js 14 App Router + TypeScript (strict)
- Tailwind CSS + shadcn/ui
- TanStack Query v5 (server state + caching). Zustand ONLY if genuine cross-page client
  state appears; do not add it speculatively.
- React Hook Form + Zod for input validation
- next-themes for dark/light
Phase 2: next-intl (EN default), Framer Motion, PostHog.

Backend (apps/api) — Phase 1:
- Fastify v4 + TypeScript (strict)
- @fastify/cors, @fastify/helmet, @fastify/rate-limit
- @fastify/swagger + @scalar/fastify-api-reference for OpenAPI at /api/docs
- fastify-type-provider-zod (single source of truth: Zod schemas drive both runtime
  validation AND the OpenAPI spec — do not hand-maintain JSON schema)
- Pino structured logging (pretty in dev, JSON in prod)
- undici/native fetch for HTTP; cheerio for HTML parsing (as in the prototype)
- playwright-core + a SINGLE shared browser pool — used ONLY as a fallback when
  InnerTube+cheerio cannot extract a required signal (see §7). Not the primary path.
Phase 2: Sentry, Pino→Axiom transport, Arcjet, BullMQ + ioredis worker.

Database & Cache:
- PostgreSQL (Neon serverless in prod; postgres:16 locally) via Drizzle ORM + drizzle-kit
- Redis (Upstash in prod; redis:7 locally) for cache + rate-limit counters + (Phase 2) BullMQ
- The app MUST run with cache disabled (Redis down) — cache failures are non-fatal.

External:
- YouTube Data API v3 (googleapis) — ENRICHMENT only, optional (see §0, §5)
- InnerTube private endpoints — primary signal source (ported from prototype)
- Cloudflare R2 (@aws-sdk/client-s3) — Phase 2, only if a durable-storage feature lands

Testing:
- Vitest (unit + integration). MSW v2 to mock both Data API and InnerTube/HTML responses.
- Playwright (@playwright/test) for E2E against the running web app.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. ENVIRONMENT VARIABLES & SECRETS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Provide .env.example for both apps. Validate ALL env at boot with a Zod schema in
`apps/api/src/config/env.ts` (and `apps/web` equivalent). Fail fast with a clear message
listing missing REQUIRED vars; optional integrations are `.optional()` and toggle features.

Required vs optional must be explicit. The app boots and serves all 8 tools with ONLY
the "required" set below.

apps/web/.env.example:
  NEXT_PUBLIC_API_URL=http://localhost:3001        # required
  NEXT_PUBLIC_SENTRY_DSN=                            # optional (Phase 2)
  NEXT_PUBLIC_POSTHOG_KEY=                           # optional (Phase 2)

apps/api/.env.example:
  # --- required ---
  DATABASE_URL=
  REDIS_URL=
  PORT=3001
  NODE_ENV=development
  CORS_ORIGIN=http://localhost:3000
  IP_HASH_SALT=                                      # required: salt for SHA-256 IP hashing
  # --- optional: Data API enrichment (0..5 keys; app works with zero) ---
  YOUTUBE_API_KEY_1=
  YOUTUBE_API_KEY_2=
  YOUTUBE_API_KEY_3=
  YOUTUBE_API_KEY_4=
  YOUTUBE_API_KEY_5=
  # --- optional: Phase 2 integrations ---
  R2_ACCOUNT_ID=
  R2_ACCESS_KEY_ID=
  R2_SECRET_ACCESS_KEY=
  R2_BUCKET_NAME=
  SENTRY_DSN=
  ARCJET_KEY=
  AXIOM_DATASET=
  AXIOM_TOKEN=

Secrets handling: never log secret values; never commit real .env; in prod load from the
platform secret store (Railway/Vercel env). Document a key-rotation note in ARCHITECTURE.md
(rotate a Data API key by swapping the env var; quota counters are keyed by index, so
rotation is transparent to the quota manager).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. DATABASE SCHEMA (packages/db)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Drizzle tables in packages/db/src/schema.ts:

1. tool_lookups
   - id              uuid pk default gen_random_uuid()
   - tool_name       varchar(64) not null      # e.g. 'monetization-checker'
   - input_url       text not null
   - result          jsonb not null
   - cached          boolean not null default false
   - signal_source   varchar(16)               # 'innertube' | 'scrape' | 'api' | 'mixed'
   - ip_hash         varchar(64) not null       # SHA-256(ip + IP_HASH_SALT)
   - created_at      timestamptz not null default now()
   - index on (tool_name, created_at), index on (ip_hash, created_at)

2. api_quota_usage   # one row per (key index, date); upserted atomically
   - id              uuid pk default gen_random_uuid()
   - api_key_index   integer not null           # 1..5
   - units_used      integer not null default 0
   - date            date not null
   - updated_at      timestamptz not null default now()
   - UNIQUE (api_key_index, date)
   WHY unique+upsert: usage is incremented concurrently; use
   `ON CONFLICT (api_key_index, date) DO UPDATE SET units_used = units_used + excluded`.
   Redis holds the live counter; this table is the durable daily rollup (see §6).

3. rate_limit_overrides   # Phase 2 only — gated behind the §6 auth decision
   - id              uuid pk
   - ip_hash         varchar(64) not null
   - daily_limit     integer not null
   - expires_at      timestamptz not null

DATA RETENTION (required, Phase 1): tool_lookups stores hashed IPs and public URLs only —
no PII. Add a scheduled purge (a simple `DELETE FROM tool_lookups WHERE created_at < now()
- interval '90 days'`) runnable via `pnpm --filter db purge` and documented for a cron.
Document the retention window in README.

Run drizzle-kit generate + migrate in setup. Migrations are checked into git.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6. CROSS-CUTTING INFRASTRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6.1 YouTube Data API quota manager (apps/api/src/lib/youtube/quota-manager.ts)
  Only relevant when ≥1 Data API key is configured. Build YoutubeQuotaManager that:
  1. Loads 0..5 keys from env (YOUTUBE_API_KEY_1.._5). If zero, `isEnabled()` returns false
     and every enrichment caller skips the Data API path cleanly.
  2. Tracks live daily usage per key in Redis: `quota:{YYYY-MM-DD}:{keyIndex}` with a TTL
     that expires after end-of-day UTC.
  3. Daily budget per key = 9500 units (buffer under the 10000 hard limit).
  4. execute<T>(units: number, fn: (apiKey: string) => Promise<T>): Promise<T>
     - Picks the next key (round-robin) whose projected usage + `units` ≤ budget.
     - INCREMENTS Redis by `units` BEFORE the call (reserve-then-spend) to avoid races
       across concurrent requests; on call failure that is NOT a quota error, the units
       stay spent (conservative) — log a debug line. On a Data-API quotaExceeded error,
       mark that key exhausted for the day and retry on the next key.
     - If no key can satisfy `units`, throw QuotaExhaustedError.
  5. Cost table (enforce, do not guess): channels.list=1, videos.list=1, search.list=100.
     Callers pass the correct unit cost. search.list is expensive — see Tool 7 note.
  6. Durable rollup: a lightweight flush writes the day's Redis counters into
     api_quota_usage via upsert (on each increment, debounced, OR a 60s timer). Document
     which; prefer write-through upsert keyed by (api_key_index, date).
  Expose: isEnabled(), execute(), getUsage(): {keyIndex, used, budget}[].
  Unit-test round-robin, exhaustion→QuotaExhaustedError, and the zero-keys disabled path.

6.2 Redis cache layer (apps/api/src/lib/cache.ts)
  CacheManager with get/set/del/getOrSet. ALL methods are fail-soft: on any Redis error,
  log once at warn and behave as a cache miss (getOrSet just runs fn). Never throw to the
  caller. Cache key pattern: `tool:{toolName}:{sha256(normalizedInputUrl)}`.
  Normalize the URL before hashing (lowercase host, strip tracking params, canonicalize).
  TTLs by tool:
    channel data 3600s · video data 1800s · images/thumbnails 86400s · earnings 3600s ·
    tags 3600s · shadowban 900s · monetization 1800s
  Stampede control: getOrSet may use a short Redis lock (SET NX, 10s) so a cache miss
  under load triggers ONE upstream fetch, not N. Document if implemented.

6.3 Rate limiting
  Per-IP, Redis-backed (@fastify/rate-limit with the Redis store), default 10 req/min.
  REMOVE the "authenticated 60 req/min" notion from Phase 1 — there is no auth system.
  If/when auth is added in Phase 2, document the tier. The rate_limit_overrides table is
  Phase 2 and requires an authenticated admin route; do not wire it in Phase 1.
  Phase 2: Arcjet at the edge for bot/abuse protection in front of the per-IP limiter.

6.4 Logging & observability
  Pino on the API with a request-id, redacting headers/secrets. Every tool request logs:
  tool_name, cached, signalSource, processingTimeMs, outcome. Phase 2: Sentry (both apps)
  and Pino→Axiom transport, both no-op when their env is absent.

6.5 Health & lifecycle (required, Phase 1)
  GET /healthz  → 200 always if the process is up (liveness).
  GET /readyz   → checks DB ping + Redis ping; 200 only if both OK (readiness). Railway/
                  orchestrator uses this. Cache being down still returns ready (cache is
                  optional) but reports "degraded" in the body.
  Graceful shutdown: on SIGTERM/SIGINT close Fastify, drain the Playwright pool, quit Redis,
  end the PG pool. The Playwright browser pool is a singleton with a max-concurrency
  semaphore (default 2) and an idle-close timeout.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7. SCRAPING / INNERTUBE LAYER (ported from prototype)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Port these into apps/api/src/lib/youtube/, typed and tested:
  - url-parser.ts          (from src/parseUrl.ts)  — parse channel/handle/slug/video/shorts/
                            youtu.be/embed/live URLs; the canonical URL builder.
  - innertube.ts           (from src/innertube.ts) — browse + player endpoints, ad-token
                            detection, ad-placement/break extraction, WEB→ANDROID fallback.
  - scrape.ts              (from src/scrapeYoutube.ts) — page fetch with jitter delay +
                            realistic headers, ytInitialData/ytInitialPlayerResponse
                            extraction, channel/video signal extractors, handle/slug resolve.
  - classify.ts            (from src/monetizationLogic.ts) — monetization status engine.
  - earnings.ts            (from src/earnings.ts) — CPM/RPM earnings model.

Playwright fallback (lib/playwright.ts): a headless-Chromium pool used ONLY when
InnerTube+cheerio fail to yield a required signal (e.g. heavily client-rendered surface).
It is NOT the default path — most tools never touch it. Pool: single browser, max 2
contexts, reused, idle-closed.

DEPLOYMENT CONSEQUENCE (critical, document in ARCHITECTURE.md):
  Playwright/Chromium CANNOT run on Vercel/Lambda-style serverless. Therefore the API
  (apps/api) deploys as a long-running CONTAINER (Railway/Fly/Render) built from a base
  image that includes the Playwright browser deps (mcr.microsoft.com/playwright). Only
  apps/web (Next.js, no browser) deploys to Vercel. The CI/CD in §11 reflects this split.

BullMQ (Phase 2, OPTIONAL): if Playwright-fallback latency becomes a problem under load,
offload fallback scrapes to a BullMQ worker (apps/api worker entrypoint) so the HTTP
request returns a job id and the client polls. Only build this if a measured need exists;
otherwise OMIT BullMQ entirely. Do not ship idle queue infrastructure.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8. THE 8 TOOLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Each tool = Zod request schema + route + service + frontend page. For each, state in code
which data layer produces each field and set `signalSource` accordingly.

Shared route contract (every tool route):
  - Validate body with a Zod schema (drives OpenAPI via the type provider).
  - Apply per-IP rate limiting (§6.3).
  - cache.getOrSet(...) around the service call.
  - Persist a tool_lookups row (fire-and-forget; DB failure must not fail the request).
  - Return the response envelope (§9).
  - Map every thrown typed error (§9) to its status code + envelope.

─────────────────────────────────────────
TOOL 1: MONETIZATION CHECKER
POST /api/tools/monetization-checker · page /monetization-checker
─────────────────────────────────────────
Input: channel URL or video URL.
Source: PRIMARY = InnerTube player (ads/adPlacements/breaks/tokens) + channel scrape
(subs, join button, made-for-kids, country, topics). Data API enrichment (optional):
canonical statistics + status.madeForKids + topicDetails when keys exist — used to
corroborate, never to assert ad presence. Classification via classify.ts.
This is exactly the prototype's `runCheck` flow — port it; do not invent a Data-API-only path.
Score 0–100 from: ad presence (strongest), join button, subs vs 1000 threshold,
playerAds flag, made-for-kids penalty, topic alignment.

MonetizationResult:
{ type:'channel'|'video'; channelId; channelTitle; thumbnailUrl; subscriberCount;
  videoCount; viewCount; isMonetized; monetizationScore; monetizationStatus:
  'monetized'|'likely_monetized'|'unlikely'|'not_monetized'; confidence;
  hasAds; adTypes:string[]; adBreakCount; adBreakOffsets:number[]; isAuthentic;
  isMadeForKids; hasJoinButton; channelCountry; topicCategories:string[];
  estimatedMonthlyEarnings:{min;max}; estimatedYearlyEarnings:{min;max};
  channelCreatedAt; defaultLanguage; tags:string[];
  signalSources: Record<string,'innertube'|'scrape'|'api'> }
NOTE: Drop fields the data layers cannot reliably produce (e.g. exact communityGuidelines
strikes, region restrictions) UNLESS a signal genuinely exists — never fabricate. Mark
unknowns null and reflect that in the UI. Honesty is a product requirement.

─────────────────────────────────────────
TOOL 2: CHANNEL ID FINDER
POST /api/tools/channel-id-finder · page /channel-id-finder
─────────────────────────────────────────
Input: any YouTube URL. Resolution order:
  /channel/UC… → direct · /@handle → Data API forHandle if keys else scrape resolve ·
  /c/custom or /user/name → Data API forUsername/search else scrape resolve ·
  video URL → extract videoId → owner channelId (player/scrape).
ChannelIdResult: { channelId; channelUrl; handle; customUrl?; userId?; channelTitle;
  description; thumbnailUrl; subscriberCount; videoCount; viewCount; country; createdAt;
  isVerified; signalSource }

─────────────────────────────────────────
TOOL 3: DATA VIEWER
POST /api/tools/data-viewer · page /data-viewer
─────────────────────────────────────────
Input: video or channel URL (auto-detect). Returns rich metadata + derived metrics.
Prefer Data API parts when keys exist (clean, complete); fall back to scrape extraction.
DataViewerResult: { type:'video'|'channel'; data:object; // normalized, documented shape
  derivedMetrics:{ engagementRate; estimatedUploadFrequency; averageViewsPerVideo;
  likeToViewRatio; commentToViewRatio; channelAgeInDays; subscribersPerDay };
  signalSource }
Do NOT dump a raw `rawApiData: object` blob as the contract — normalize to a typed,
documented shape so the OpenAPI spec and frontend are stable.

─────────────────────────────────────────
TOOL 4: IMAGE TOOL
POST /api/tools/image-tool · page /image-tool
─────────────────────────────────────────
Input: channel or video URL. No Data API needed for video thumbnails (deterministic
img.youtube.com URLs). For channels, get avatar (snippet.thumbnails) + banner
(brandingSettings.image) via Data API if keys, else scrape avatar/banner from ytInitialData.
HEAD-check each URL for real availability (concurrency-capped, timeout-bounded). Only emit
the banner sizes that actually resolve — do not assert a fixed list of "17 sizes"; probe.
ImageToolResult: { type; channelTitle; thumbnails:[{label;url;width;height;available}];
  profilePictures:[{size;url;width;height}]; bannerImages:[{label;url;width;height;available}] }

─────────────────────────────────────────
TOOL 5: TAG EXTRACTOR
POST /api/tools/tag-extractor · page /tag-extractor
─────────────────────────────────────────
Input: video or channel URL.
Video tags: Data API videos.list snippet.tags if keys, else scrape ytInitialPlayerResponse/
meta keywords. Channel keywords: brandingSettings.channel.keywords — PARSE the
space-separated, quoted-phrase format correctly ("web development" stays one tag).
TagExtractorResult: { type; title; tags:string[]; tagCount; totalCharacters;
  remainingCharacters; // 500 - totalCharacters for videos, null for channels
  copyableString; signalSource }

─────────────────────────────────────────
TOOL 6: MONEY CALCULATOR
POST /api/tools/money-calculator · page /money-calculator
─────────────────────────────────────────
Input: channel URL, video URL, OR manual {views, niche, country}. With a URL, fetch real
stats (scrape primary, Data API enrichment). Use the PORTED earnings.ts model (already
proven). Keep ONE canonical CPM table — reconcile the prototype's `CPM_USD` with the
country tiers; do not maintain two divergent tables. Apply niche multipliers and the ~45%
RPM-of-CPM creator share. Always return min/avg/max ranges and a disclaimer.
CPM_BY_COUNTRY (canonical, reconcile with src/earnings.ts):
  US{6,9,15} GB{5,8,13} CA{5,7,12} AU{5,7,11} DE{4,6,10} FR{3,5,8}
  IN{0.5,1,2} BR{0.8,1.5,3} DEFAULT{1,2,4}
CPM_NICHE_MULTIPLIER: finance2.5 tech2.0 business2.2 health1.8 education1.5 lifestyle1.2
  gaming1.0 entertainment1.0 comedy0.9 kids0.3
MoneyCalculatorResult: { channelTitle?; subscriberCount?; totalViews?; monthlyViews;
  estimatedCountry; detectedNiche; cpmRange:{min;avg;max}; rpmRange:{min;avg;max};
  earnings:{ perVideo:{min;avg;max}; monthly:{...}; yearly:{...} }; disclaimer }

─────────────────────────────────────────
TOOL 7: SHADOWBAN DETECTOR
POST /api/tools/shadowban-detector · page /shadowban-detector
─────────────────────────────────────────
Input: channel URL.
QUOTA WARNING: search.list costs 100 units. Do NOT spam it. Strategy:
  - Primary signals (cheap, no API quota): channel page reachable & privacyStatus public
    (scrape), hiddenSubscriberCount, made-for-kids, channel indexable.
  - Search-visibility check (the search.list call) is GATED: only run it when Data API keys
    exist AND remaining quota is healthy; otherwise mark that single check as 'skipped'
    with a clear reason in the UI (never silently drop it). Cache shadowban results 900s.
ShadowbanResult: { channelId; channelTitle; thumbnailUrl; subscriberCount; isShadowbanned;
  shadowbanScore; shadowbanStatus:'clean'|'partial'|'likely'|'shadowbanned';
  checks:{ searchVisibility:{passed|null; details}; channelPublicStatus:{passed;details};
  subscriberVisibility:{passed;details}; madeForKids:{passed;details};
  searchIndexed:{passed;details} }; recommendations:string[]; signalSource }

─────────────────────────────────────────
TOOL 8: THUMBNAIL DOWNLOADER
POST /api/tools/thumbnail-downloader · page /thumbnail-downloader
─────────────────────────────────────────
Input: video URL or ID (watch/youtu.be/shorts/embed/live). Build img.youtube.com URLs
(no API). HEAD-check each (maxresdefault often missing), capturing Content-Length when
present. Fetch title/channel via Data API videos.list if keys, else scrape.
DOWNLOAD NOTE: serve thumbnails as direct img.youtube.com links (client downloads them).
Do NOT proxy/store media server-side or in R2 in Phase 1 — that adds cost, copyright
exposure, and bandwidth for no benefit. R2 is only justified if you later add zip-bundle
downloads; gate that behind R2 env and Phase 2.
ThumbnailResult: { videoId; videoTitle; channelTitle; channelId;
  thumbnails:[{quality;label;url;width;height;available;fileSize?}]; signalSource }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9. API SERVER STRUCTURE & ERROR CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

apps/api/src/
├── index.ts                 # bootstrap: env validation → plugins → routes → listen
├── config/env.ts            # Zod-validated env (fail fast)
├── plugins/                 # cors, helmet, rate-limit, swagger, (Phase2: sentry, arcjet)
├── lib/
│   ├── cache.ts
│   ├── youtube/             # quota-manager, data-api client, innertube, scrape,
│   │                        # url-parser, classify, earnings (ported)
│   └── playwright.ts        # fallback browser pool
├── routes/
│   ├── health.ts            # /healthz, /readyz
│   └── tools/*.ts           # one per tool (8 files)
├── services/*.ts            # one per tool (8 files)
├── errors/                  # typed error classes + the toEnvelope mapper
└── types/index.ts

Error types (packages/validators/src/errors.ts), each carrying a stable `code` + statusCode:
  InvalidUrlError 400 · ChannelNotFoundError 404 · VideoNotFoundError 404 ·
  QuotaExhaustedError 429 · RateLimitError 429 · ScrapingError 502 ·
  YouTubeApiError 502 · CacheError (internal, non-fatal — never reaches the client)

Response envelope (every route, success and failure):
  Success: { success:true,  data:T, cached:boolean, signalSource:string, processingTimeMs:number }
  Error:   { success:false, error:{ code:string, message:string, statusCode:number } }
A single Fastify error handler maps typed errors → envelope; unknown errors → 500 with a
generic message (never leak internals/stack to the client; log full detail server-side).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10. FRONTEND STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

apps/web/src/
├── app/
│   ├── layout.tsx           # theme provider, header, footer
│   ├── page.tsx             # homepage: grid of 8 tool cards
│   └── <tool>/page.tsx      # 8 tool pages
├── components/
│   ├── layout/{Header,Footer}.tsx
│   └── tools/{ToolInput,ToolResult,LoadingSkeleton,ErrorState}.tsx
├── hooks/{useToolQuery,useCopyToClipboard}.ts
└── lib/{api-client,utils}.ts   # typed client over the envelope; number/URL formatting

Each tool page: URL input with real-time Zod validation → loading skeleton → result card →
cache indicator (⚡ Cached / 🔄 Fresh) + a small "signal source" badge → Copy (text) /
Download (images) → related-tools links → mobile-first responsive → Next.js SEO metadata
(title, description, canonical). ErrorState renders a distinct, actionable message per
error `code` (invalid URL vs not found vs rate-limited vs quota vs upstream failure) with
a retry where retry makes sense.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12. TESTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Unit (Vitest):
  lib/youtube/url-parser.test.ts   — every URL format across all 8 tools + edge cases
  lib/youtube/quota-manager.test.ts— round-robin, exhaustion, zero-keys disabled, Redis race
  lib/cache.test.ts                — hit/miss, TTL, getOrSet, fail-soft when Redis throws
  lib/youtube/classify.test.ts     — monetization status matrix (port prototype cases)
  lib/youtube/earnings.test.ts     — per-country CPM, niche multipliers, 0-views/no-country
Integration (Vitest + MSW v2 mocking BOTH Data API and InnerTube/HTML):
  each tool route → asserts the response envelope, cache behavior, and each error mapping
  (invalid URL, not found, quota exhausted, rate limited, upstream failure).
  Critically: a "no Data API keys configured" suite proving every tool still works on the
  scraping layer alone.
E2E (Playwright) tests/e2e/:
  thumbnail-downloader, channel-id-finder, tag-extractor happy paths against the running app.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13. DOCUMENTATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

README.md: prerequisites (Node 20, pnpm, Docker); from-scratch local setup; OPTIONAL Data
API key setup (and the explicit note that the app runs without keys); Neon + Upstash setup;
running all services; the web-on-Vercel / api-as-container deploy split; data-retention note.
ARCHITECTURE.md: ASCII architecture diagram; the §0 data-source hierarchy and WHY the Data
API can't detect monetization; the ToS/legal stance + mitigations; quota strategy + the
search.list cost caveat; caching + stampede strategy; rate-limiting strategy; the
scraping→Playwright fallback flow; the serverless-vs-container deploy constraint; secret
rotation; every "reasonable decision" you made.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14. EXECUTION ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.  Monorepo scaffold (turbo + pnpm workspaces) + shared config/validators/db packages.
2.  Drizzle schema + generate + migrate against local Postgres.
3.  Fastify skeleton: env validation, plugins, error handler, envelope, /healthz, /readyz,
    OpenAPI at /api/docs.
4.  Port prototype libs to TS under lib/youtube/ (url-parser, scrape, innertube, classify,
    earnings) WITH unit tests proving behavior parity; build cache.ts + quota-manager.ts.
5.  Implement the 8 services using the data-source hierarchy; set signalSource per field.
6.  Wire 8 routes (Zod schemas → OpenAPI), cache, rate limit, tool_lookups persistence.
7.  Integration tests incl. the "zero Data API keys" suite. Make them green.
8.  Next.js app: shared components, api-client, 8 pages, SEO, responsive, error states.
9.  E2E tests.
10. Docker Compose + api Dockerfile (Playwright base) + CI/CD with the deploy split.
11. README + ARCHITECTURE.
12. Delete legacy root files (server.js, public/, src/) once parity tests pass.
13. Phase 2 (only if requested/needed): i18n, motion, Sentry/Axiom/Arcjet/PostHog, R2,
    BullMQ worker, rate_limit_overrides admin (+ the auth system it requires).

After each step run `tsc --noEmit` across the monorepo and fix all type errors before
proceeding. Leave no type errors and no stray console.* in shipped code (use Pino).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
15. QUALITY GATES (Phase 1 must satisfy ALL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- Zero TypeScript errors (strict mode, all packages).
- All unit + integration tests pass, INCLUDING the zero-Data-API-keys suite.
- E2E happy paths pass.
- No hardcoded secrets anywhere; env validated at boot; app boots with only required env.
- All 8 routes return the correct envelope and map every typed error to the right status.
- The app fully functions with Redis down (cache fail-soft) and with zero Data API keys.
- /healthz and /readyz behave correctly; graceful shutdown drains Playwright + connections.
- Monetization/ad/shadowban signals derive from InnerTube/scrape (NOT a Data API
  monetizationDetails part — that part must appear nowhere in the code).
- No fabricated fields: anything the data layers can't produce is null and shown as unknown.
- Frontend error states render correctly per error code; mobile responsive at 375px.
- OpenAPI docs at /api/docs reflect the live Zod schemas.
- Lighthouse > 90 on the homepage.
- README setup works from scratch; ARCHITECTURE documents every decision.

Begin now. Work methodically through the execution order. Make all reasonable decisions
yourself and document them in ARCHITECTURE.md. Where this document and YouTube's real
behavior conflict, real behavior and §0 win — flag any such conflict in ARCHITECTURE.md
rather than building something that returns confidently wrong answers.
