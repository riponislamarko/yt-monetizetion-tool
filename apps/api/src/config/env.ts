import { z } from "zod";

/**
 * Boot-time environment validation (CLAUDE.md §4). The app MUST boot and serve all 8 tools
 * with ONLY the `required` set. Optional integrations are `.optional()` and toggle features;
 * a missing optional integration degrades gracefully and never crashes the process.
 *
 * Fails fast with a clear, aggregated message listing every missing/invalid REQUIRED var.
 */

const envSchema = z.object({
  // --- required ---
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required."),
  REDIS_URL: z.string().min(1, "REDIS_URL is required."),
  CORS_ORIGIN: z.string().min(1).default("http://localhost:3000"),
  IP_HASH_SALT: z.string().min(1, "IP_HASH_SALT is required (salt for SHA-256 IP hashing)."),

  // --- optional: Data API enrichment (0..5 keys; app works with zero) ---
  YOUTUBE_API_KEY_1: z.string().min(1).optional(),
  YOUTUBE_API_KEY_2: z.string().min(1).optional(),
  YOUTUBE_API_KEY_3: z.string().min(1).optional(),
  YOUTUBE_API_KEY_4: z.string().min(1).optional(),
  YOUTUBE_API_KEY_5: z.string().min(1).optional(),

  // --- optional: per-IP rate limit ---
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW: z.string().default("1 minute"),

  // --- optional: Phase 2 integrations (no-op when absent) ---
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ARCJET_KEY: z.string().optional(),
  AXIOM_DATASET: z.string().optional(),
  AXIOM_TOKEN: z.string().optional(),

  // --- optional: Phase 2 admin (rate_limit_overrides). When unset, admin routes are disabled. ---
  ADMIN_API_KEY: z.string().min(16).optional(),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  // Treat present-but-empty values (e.g. `YOUTUBE_API_KEY_1=` in a copied .env.example) as
  // absent, so `.optional()` fields validate correctly instead of failing `.min(1)`.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    cleaned[k] = typeof v === "string" && v.trim() === "" ? undefined : v;
  }
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** The configured Data API keys, in index order (1..5). Empty when none configured. */
export function youtubeApiKeys(env: Env): string[] {
  return [
    env.YOUTUBE_API_KEY_1,
    env.YOUTUBE_API_KEY_2,
    env.YOUTUBE_API_KEY_3,
    env.YOUTUBE_API_KEY_4,
    env.YOUTUBE_API_KEY_5,
  ].filter((k): k is string => typeof k === "string" && k.length > 0);
}
