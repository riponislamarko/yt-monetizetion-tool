/**
 * Earnings model — ported from the prototype's earnings.js and reconciled to the single
 * canonical CPM table mandated by CLAUDE.md §8 (Tool 6). There is exactly ONE CPM table in
 * the codebase; the prototype's divergent `CPM_USD` is intentionally retired in favour of
 * the per-country min/avg/max tiers below.
 *
 * Model:
 *   - CPM (cost per mille) is what advertisers pay per 1000 monetizable impressions.
 *   - RPM (revenue per mille) is the creator's actual take. We model the standard ~45%
 *     creator share of CPM (YouTube keeps ~45%, plus not every view is monetized).
 *   - Niche multipliers scale CPM up/down by content category.
 * Everything is a RANGE (min/avg/max); a point estimate would imply false precision.
 */

export type Niche =
  | "finance"
  | "tech"
  | "business"
  | "health"
  | "education"
  | "lifestyle"
  | "gaming"
  | "entertainment"
  | "comedy"
  | "kids";

export interface CpmTier {
  min: number;
  avg: number;
  max: number;
}

/** Canonical per-country CPM in USD (CLAUDE.md §8). Keyed by ISO-3166 alpha-2, plus DEFAULT. */
export const CPM_BY_COUNTRY: Record<string, CpmTier> = {
  US: { min: 6, avg: 9, max: 15 },
  GB: { min: 5, avg: 8, max: 13 },
  CA: { min: 5, avg: 7, max: 12 },
  AU: { min: 5, avg: 7, max: 11 },
  DE: { min: 4, avg: 6, max: 10 },
  FR: { min: 3, avg: 5, max: 8 },
  IN: { min: 0.5, avg: 1, max: 2 },
  BR: { min: 0.8, avg: 1.5, max: 3 },
  DEFAULT: { min: 1, avg: 2, max: 4 },
};

/** Niche CPM multipliers (CLAUDE.md §8). */
export const CPM_NICHE_MULTIPLIER: Record<Niche, number> = {
  finance: 2.5,
  business: 2.2,
  tech: 2.0,
  health: 1.8,
  education: 1.5,
  lifestyle: 1.2,
  gaming: 1.0,
  entertainment: 1.0,
  comedy: 0.9,
  kids: 0.3,
};

/** Creator share of CPM realised as RPM (~45%). */
export const RPM_SHARE = 0.45;

export function cpmTierForCountry(countryCode: string | null | undefined): CpmTier {
  if (!countryCode || typeof countryCode !== "string") return CPM_BY_COUNTRY.DEFAULT!;
  const c = countryCode.trim().toUpperCase();
  return CPM_BY_COUNTRY[c] ?? CPM_BY_COUNTRY.DEFAULT!;
}

export function nicheMultiplier(niche: Niche | null | undefined): number {
  if (!niche) return 1;
  return CPM_NICHE_MULTIPLIER[niche] ?? 1;
}

export interface Range {
  min: number;
  avg: number;
  max: number;
}

export interface EarningsEstimate {
  monthlyViews: number;
  cpmRange: Range;
  rpmRange: Range;
  earnings: {
    perVideo: Range;
    monthly: Range;
    yearly: Range;
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Estimate earnings from monthly views, country, niche, and (optional) video count.
 * Used by both the Money Calculator (Tool 6) and the Monetization Checker (Tool 1).
 */
export function estimateEarnings(params: {
  monthlyViews: number;
  countryCode?: string | null;
  niche?: Niche | null;
  videoCount?: number;
}): EarningsEstimate {
  const views = Math.max(0, Number(params.monthlyViews) || 0);
  const tier = cpmTierForCountry(params.countryCode);
  const mult = nicheMultiplier(params.niche);

  const cpmRange: Range = {
    min: round2(tier.min * mult),
    avg: round2(tier.avg * mult),
    max: round2(tier.max * mult),
  };
  const rpmRange: Range = {
    min: round2(cpmRange.min * RPM_SHARE),
    avg: round2(cpmRange.avg * RPM_SHARE),
    max: round2(cpmRange.max * RPM_SHARE),
  };

  const per1000 = views / 1000;
  const monthly: Range = {
    min: round2(per1000 * rpmRange.min),
    avg: round2(per1000 * rpmRange.avg),
    max: round2(per1000 * rpmRange.max),
  };
  const yearly: Range = {
    min: round2(monthly.min * 12),
    avg: round2(monthly.avg * 12),
    max: round2(monthly.max * 12),
  };

  const vc = Math.max(1, Math.floor(Number(params.videoCount) || 1));
  const perVideo: Range = {
    min: round2(monthly.min / vc),
    avg: round2(monthly.avg / vc),
    max: round2(monthly.max / vc),
  };

  return {
    monthlyViews: views,
    cpmRange,
    rpmRange,
    earnings: { perVideo, monthly, yearly },
  };
}

export const EARNINGS_DISCLAIMER =
  "Estimates are modelled from public view counts and regional CPM averages with a ~45% " +
  "creator share. Actual YouTube earnings vary widely with watch time, ad fill rate, " +
  "audience geography, seasonality, and AdSense deductions. Treat this as a rough range, " +
  "not a guarantee.";
