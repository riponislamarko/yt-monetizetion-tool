/**
 * Monetization classification engine — ported from the prototype's monetizationLogic.js.
 *
 * The decision tree (determineStatus) is preserved verbatim from the prototype so the
 * parity tests pass; on top of it we compute a continuous 0–100 `monetizationScore` and
 * map the prototype's four-way status onto the public contract enum (CLAUDE.md §8, Tool 1).
 *
 * IMPORTANT (§0): every input here originates from InnerTube/scrape signals. The Data API
 * is never the source of an ad/monetization signal — only optional corroboration upstream.
 */

export interface MonetizationSignals {
  hasJoinButton: boolean;
  subscriberCountRaw: number;
  hasAdsInVideo: boolean;
  ytAdToken: boolean;
  isMadeForKids: boolean;
  playerAdsEnabled: boolean;
  adCount: number;
  /** Optional topic alignment hint (channel topics overlap with a monetizable niche). */
  topicAligned?: boolean;
}

export type LegacyStatus = "MONETIZED" | "LIKELY_MONETIZED" | "NOT_MONETIZED" | "UNKNOWN";

/** Public contract enum (CLAUDE.md §8, Tool 1). */
export type MonetizationStatus = "monetized" | "likely_monetized" | "unlikely" | "not_monetized";

export interface ClassificationResult {
  legacyStatus: LegacyStatus;
  status: MonetizationStatus;
  isMonetized: boolean;
  /** 0–100 weighted score; independent of the discrete status decision. */
  score: number;
  confidence: number;
  reasons: string[];
}

const STATUS_MAP: Record<LegacyStatus, MonetizationStatus> = {
  MONETIZED: "monetized",
  LIKELY_MONETIZED: "likely_monetized",
  NOT_MONETIZED: "not_monetized",
  UNKNOWN: "unlikely",
};

/**
 * Weighted 0–100 score. Ad presence is the strongest signal (§8). Independent of the
 * discrete status so the UI can show a gauge that does not just snap to four buckets.
 */
function computeScore(s: MonetizationSignals): number {
  let score = 0;
  // Ad presence — strongest signal.
  if (s.hasAdsInVideo || s.adCount > 0) score += 40;
  if (s.ytAdToken) score += 12;
  if (s.playerAdsEnabled) score += 10;
  // Membership / Join button.
  if (s.hasJoinButton) score += 20;
  // Subscriber threshold (YPP requires 1000).
  if (s.subscriberCountRaw >= 1000) score += 12;
  else if (s.subscriberCountRaw >= 500) score += 5;
  // Topic alignment with a monetizable niche.
  if (s.topicAligned) score += 6;
  // Made-for-kids penalty (limited/no personalized ads → harder monetization).
  if (s.isMadeForKids) score -= 25;
  return Math.max(0, Math.min(100, score));
}

/**
 * Port of the prototype's determineStatus — DO NOT change the branch order or thresholds;
 * the parity test suite asserts against these exact outcomes.
 */
export function classifyMonetization(signals: MonetizationSignals): ClassificationResult {
  const {
    hasJoinButton = false,
    subscriberCountRaw = 0,
    hasAdsInVideo = false,
    ytAdToken = false,
    isMadeForKids = false,
    playerAdsEnabled = false,
    adCount = 0,
  } = signals;

  const reasons: string[] = [];

  if (hasJoinButton) reasons.push("✅ Join button detected");
  if (hasAdsInVideo || adCount > 0) reasons.push("✅ Ads found in video");
  if (subscriberCountRaw >= 1000) reasons.push("✅ Over 1000 subscribers");
  else if (subscriberCountRaw > 0) reasons.push(`ℹ️ Subscriber count: ${subscriberCountRaw}`);

  if (ytAdToken) reasons.push("✅ Ad-related tokens detected in API payload");
  else reasons.push("ℹ️ No ad tokens detected in API payload");

  if (playerAdsEnabled) reasons.push("✅ Player ads flag enabled");
  else reasons.push("ℹ️ Player ads flag not enabled");

  if (isMadeForKids)
    reasons.push("⚠️ Channel or video appears made for kids (stricter monetization rules)");
  else reasons.push("ℹ️ Not flagged as made-for-kids in available metadata");

  if (subscriberCountRaw < 500)
    reasons.push("⚠️ Under 500 subscribers (Partner Program threshold is 1000 + 4k hours)");

  const score = computeScore(signals);

  const finish = (legacyStatus: LegacyStatus, confidence: number, extra: string[] = []): ClassificationResult => ({
    legacyStatus,
    status: STATUS_MAP[legacyStatus],
    isMonetized: legacyStatus === "MONETIZED" || legacyStatus === "LIKELY_MONETIZED",
    score,
    confidence,
    reasons: extra.length ? [...reasons, ...extra] : reasons,
  });

  const monetizedStrong =
    hasJoinButton === true || (adCount > 0 && ytAdToken === true && subscriberCountRaw >= 1000);
  if (monetizedStrong) return finish("MONETIZED", hasJoinButton ? 94 : 91);

  const likely = subscriberCountRaw >= 1000 && playerAdsEnabled === true && isMadeForKids === false;
  if (likely) return finish("LIKELY_MONETIZED", 74);

  const notMonetizedStrong =
    subscriberCountRaw < 500 || isMadeForKids === true || (adCount === 0 && ytAdToken === false);
  if (notMonetizedStrong) {
    return finish("NOT_MONETIZED", isMadeForKids || subscriberCountRaw < 500 ? 85 : 81);
  }

  return finish("UNKNOWN", 42, ["ℹ️ Not enough overlapping signals for a firm classification"]);
}
