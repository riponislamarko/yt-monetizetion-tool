import type { MonetizationResult, UrlRequest, SignalSource } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { classifyMonetization } from "../lib/youtube/classify.js";
import { estimateEarnings } from "../lib/youtube/earnings.js";
import {
  combineSources,
  fetchChannelAdSignals,
  fetchChannelBundle,
  fetchVideoBundle,
  resolveChannelId,
  type ChannelBundle,
  type VideoBundle,
} from "./shared.js";
import type { AdSignals } from "../lib/youtube/scrape.js";

/** Rough monthly views from lifetime views and channel age. Null when age is unknown. */
function deriveMonthlyViews(totalViews: number | null, createdAt: string | null): number | null {
  if (!totalViews || !createdAt) return null;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return null;
  const months = Math.max(1, (Date.now() - created) / (1000 * 60 * 60 * 24 * 30.4));
  return Math.round(totalViews / months);
}

const MONETIZABLE_TOPIC_RE = /(finance|tech|business|education|gaming|music|sport|news|science|how)/i;

export async function runMonetizationChecker(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<MonetizationResult>> {
  const parsed = parseUrl(body.url);
  const isVideo = parsed.type === "video";

  let video: VideoBundle | null = null;
  let channel: ChannelBundle;
  const sources: SignalSource[] = [];

  // Ad signal (§0). For a video we read its own player response; for a channel we sample the
  // latest upload. This is the reliable, working replacement for the dead InnerTube ad path.
  let adSignals: AdSignals;

  if (isVideo) {
    video = await fetchVideoBundle(parsed.id!, ctx);
    sources.push(video.source);
    adSignals = video.adSignals;
    const channelId = video.channelId ?? (await resolveChannelId(parsed, ctx));
    channel = await fetchChannelBundle(channelId, ctx);
  } else {
    const channelId = await resolveChannelId(parsed, ctx);
    // The channel bundle and the latest-video ad sample are independent — fetch concurrently.
    [channel, adSignals] = await Promise.all([
      fetchChannelBundle(channelId, ctx),
      fetchChannelAdSignals(channelId, ctx),
    ]);
  }
  sources.push(channel.source);

  const subscriberCount = channel.subscriberCount ?? 0;
  const isMadeForKids =
    channel.signals.isMadeForKids || (channel.isFamilySafe === false ? true : false);
  const topicAligned = channel.topics.some((t) => MONETIZABLE_TOPIC_RE.test(t));

  // Ad placement signals now drive the verdict. `adsEnabled` (a reserved ad slot exists) is
  // the strongest public proxy for monetization. We only treat "no ads" as meaningful when we
  // actually got a readable player response (adSignals.available) — otherwise it's unknown.
  const adSignalAvailable = adSignals.available;
  const hasAdsInVideo = adSignals.adsEnabled;
  const adCount = adSignals.adPlacementCount || (video?.player?.adCount ?? 0);
  const adTypes = adSignals.adRendererTypes.length
    ? adSignals.adRendererTypes
    : (video?.player?.adTypes ?? []);
  const adBreakOffsets = video?.player?.adBreakOffsets ?? [];
  const playerAdsEnabled = adSignals.playerAdsEnabled;
  // An ad slot / forecasting renderer IS the ad token signal in the page response.
  const ytAdToken = adSignals.adsEnabled || adSignals.hasForecastingAd || channel.ytAdToken;

  const classification = classifyMonetization({
    hasJoinButton: channel.signals.hasJoinButton,
    subscriberCountRaw: subscriberCount,
    hasAdsInVideo,
    ytAdToken,
    isMadeForKids,
    playerAdsEnabled,
    adCount,
    topicAligned,
  });

  // Earnings: derive monthly views from lifetime views + age when possible (no fabrication).
  const totalViews = channel.dataApi?.viewCount ?? null;
  const createdAt = channel.dataApi?.publishedAt ?? null;
  const monthlyViews = deriveMonthlyViews(totalViews, createdAt);
  const country = channel.dataApi?.country ?? channel.signals.country ?? null;

  let estimatedMonthlyEarnings: { min: number; max: number } | null = null;
  let estimatedYearlyEarnings: { min: number; max: number } | null = null;
  if (monthlyViews != null) {
    const est = estimateEarnings({ monthlyViews, countryCode: country });
    estimatedMonthlyEarnings = { min: est.earnings.monthly.min, max: est.earnings.monthly.max };
    estimatedYearlyEarnings = { min: est.earnings.yearly.min, max: est.earnings.yearly.max };
  }

  const signalSources: Record<string, SignalSource> = {
    ads: "scrape", // watch-page player response (the InnerTube ad path is dead — see ARCHITECTURE)
    subscribers: channel.dataApi?.subscriberCount != null ? "api" : "scrape",
    joinButton: "scrape",
    madeForKids: channel.isFamilySafe != null ? "innertube" : "scrape",
    topics: channel.topics.length ? "innertube" : "scrape",
    country: channel.dataApi?.country ? "api" : "scrape",
  };

  // Honesty: if we couldn't read a player response, ad-presence is UNKNOWN — say so rather
  // than letting "no ads found" masquerade as a negative verdict (§15 honesty gate).
  const reasons = adSignalAvailable
    ? [
        hasAdsInVideo
          ? `✅ Ad slot reserved on the ${isVideo ? "video" : "latest video"} (monetization active)`
          : "ℹ️ No ad placements found on the sampled video",
        ...classification.reasons,
      ]
    : ["⚠️ Ad signal unavailable (video unplayable/region-locked) — verdict from eligibility signals only", ...classification.reasons];

  const data: MonetizationResult = {
    type: isVideo ? "video" : "channel",
    channelId: channel.channelId,
    channelTitle: channel.signals.channelName ?? channel.dataApi?.title ?? null,
    thumbnailUrl: channel.signals.avatarUrl ?? channel.dataApi?.thumbnailUrl ?? null,
    subscriberCount: channel.subscriberCount,
    videoCount: channel.videoCount,
    viewCount: totalViews,
    isMonetized: classification.isMonetized,
    monetizationScore: classification.score,
    monetizationStatus: classification.status,
    confidence: classification.confidence,
    hasAds: hasAdsInVideo,
    adTypes,
    adBreakCount: adBreakOffsets.length,
    adBreakOffsets,
    isAuthentic: channel.signals.isVerified || subscriberCount >= 1000,
    isMadeForKids: channel.isFamilySafe != null ? isMadeForKids : channel.signals.isMadeForKids,
    hasJoinButton: channel.signals.hasJoinButton,
    channelCountry: country,
    topicCategories: channel.topics,
    estimatedMonthlyEarnings,
    estimatedYearlyEarnings,
    channelCreatedAt: createdAt,
    defaultLanguage: video?.dataApi?.defaultLanguage ?? null,
    tags: video?.dataApi?.tags ?? channel.signals.keywords ?? [],
    reasons,
    signalSources,
  };

  return { data, signalSource: combineSources(...sources) };
}
