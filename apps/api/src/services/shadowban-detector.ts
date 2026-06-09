import type { ShadowbanResult, UrlRequest, SignalSource } from "@yt/validators";
import { QuotaExhaustedError } from "@yt/validators/errors";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { fetchChannelBundle, resolveChannelId } from "./shared.js";

/**
 * Shadowban detector (§8 Tool 7). Primary checks are CHEAP (scrape, no Data API quota). The
 * search-visibility check costs 100 units (search.list) and is GATED: only run when keys
 * exist AND quota is healthy; otherwise it is reported as `passed: null` ("skipped") with a
 * reason — never silently dropped.
 */
export async function runShadowbanDetector(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<ShadowbanResult>> {
  const parsed = parseUrl(body.url);
  const channelId = await resolveChannelId(parsed, ctx);
  const c = await fetchChannelBundle(channelId, ctx);

  const sources: SignalSource[] = [c.source];

  // Cheap checks.
  const channelPublic = Boolean(c.signals.channelName); // page reachable & rendered
  const hiddenSubs = c.dataApi?.hiddenSubscriberCount ?? false;
  const subscriberVisible = !hiddenSubs && c.subscriberCount != null;
  const madeForKids = c.dataApi?.madeForKids ?? (c.isFamilySafe === false);
  const indexable = channelPublic; // a public, rendered channel page is crawlable

  // Gated search-visibility check.
  let searchVisibilityPassed: boolean | null = null;
  let searchVisibilityDetails =
    "Search-visibility check skipped: no YouTube Data API key configured (search.list costs 100 units).";
  if (ctx.dataApi.isEnabled()) {
    const usage = await ctx.quota.getUsage();
    const healthy = usage.some((u) => u.used + 100 <= u.budget);
    if (!healthy) {
      searchVisibilityDetails =
        "Search-visibility check skipped: Data API quota is too low to safely spend 100 units.";
    } else {
      try {
        const query = c.signals.channelName ?? channelId;
        const visible = await ctx.dataApi.searchChannelVisibility(query, channelId);
        searchVisibilityPassed = visible;
        searchVisibilityDetails = visible
          ? "Channel appears in YouTube search results for its name."
          : "Channel did NOT appear in search results for its name — possible search suppression.";
        sources.push("api");
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          searchVisibilityDetails = "Search-visibility check skipped: Data API quota exhausted.";
        } else {
          searchVisibilityDetails = "Search-visibility check failed against the Data API.";
        }
      }
    }
  }

  const checks: ShadowbanResult["checks"] = {
    searchVisibility: { passed: searchVisibilityPassed, details: searchVisibilityDetails },
    channelPublicStatus: {
      passed: channelPublic,
      details: channelPublic ? "Channel page is public and reachable." : "Channel page could not be loaded.",
    },
    subscriberVisibility: {
      passed: subscriberVisible,
      details: hiddenSubs
        ? "Subscriber count is hidden."
        : subscriberVisible
          ? "Subscriber count is publicly visible."
          : "Subscriber count could not be read.",
    },
    madeForKids: {
      passed: !madeForKids,
      details: madeForKids
        ? "Channel is made-for-kids — discovery and features are limited by policy (not a shadowban)."
        : "Channel is not flagged made-for-kids.",
    },
    searchIndexed: {
      passed: indexable,
      details: indexable ? "Channel content is indexable." : "Channel content does not appear indexable.",
    },
  };

  // Score: count failed checks among those with a definite verdict.
  const verdicts = Object.values(checks).map((c2) => c2.passed);
  const decided = verdicts.filter((v) => v !== null) as boolean[];
  const failed = decided.filter((v) => !v).length;
  const shadowbanScore = decided.length ? Math.round((failed / decided.length) * 100) : 0;

  let shadowbanStatus: ShadowbanResult["shadowbanStatus"] = "clean";
  if (shadowbanScore >= 60) shadowbanStatus = "shadowbanned";
  else if (shadowbanScore >= 40) shadowbanStatus = "likely";
  else if (shadowbanScore >= 20) shadowbanStatus = "partial";

  const recommendations: string[] = [];
  if (searchVisibilityPassed === false)
    recommendations.push("Review recent uploads for policy strikes; re-verify channel name visibility in incognito search.");
  if (hiddenSubs) recommendations.push("Consider unhiding your subscriber count to improve perceived authenticity.");
  if (madeForKids) recommendations.push("Made-for-kids limits are policy-driven, not a shadowban — expect reduced discovery.");
  if (!recommendations.length) recommendations.push("No shadowban indicators found from public signals.");

  const data: ShadowbanResult = {
    channelId: c.channelId,
    channelTitle: c.signals.channelName ?? c.dataApi?.title ?? null,
    thumbnailUrl: c.signals.avatarUrl ?? c.dataApi?.thumbnailUrl ?? null,
    subscriberCount: c.subscriberCount,
    isShadowbanned: shadowbanStatus === "shadowbanned" || shadowbanStatus === "likely",
    shadowbanScore,
    shadowbanStatus,
    checks,
    recommendations,
  };

  const unique = [...new Set(sources)];
  return { data, signalSource: unique.length > 1 ? "mixed" : unique[0] ?? "scrape" };
}
