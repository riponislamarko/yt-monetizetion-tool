import { ChannelNotFoundError, VideoNotFoundError } from "@yt/validators/errors";
import type { SignalSource } from "@yt/validators";
import type { AppContext } from "../context.js";
import { type ParsedUrl } from "../lib/youtube/url-parser.js";
import {
  extractAdSignals,
  extractChannelSignals,
  extractVideoPageBasics,
  extractVideoPageOwnerSignals,
  fetchLatestVideoId,
  parseSubscriberCountRaw,
  parseVideoCountRaw,
  resolveHandleOrSlug,
  scrapeYoutubePage,
  type AdSignals,
  type ChannelSignals,
} from "../lib/youtube/scrape.js";
import { browseChannel } from "../lib/youtube/innertube.js";
import { fetchVideoPlayer, type VideoPlayerResult } from "../lib/youtube/innertube.js";
import type { DataApiChannel, DataApiVideo } from "../lib/youtube/data-api.js";

/** Track which layer produced the dominant signal so the envelope can report it (§0). */
export function combineSources(...sources: Array<SignalSource | null | undefined>): SignalSource {
  const present = sources.filter(Boolean) as SignalSource[];
  const unique = [...new Set(present)];
  if (unique.length === 0) return "scrape";
  if (unique.length === 1) return unique[0]!;
  return "mixed";
}

const channelUrl = (id: string) => `https://www.youtube.com/channel/${id}`;

/**
 * Resolve any parsed YouTube URL to a canonical channelId. Resolution order per §8 Tool 2:
 * direct channel id → handle (Data API forHandle, else scrape) → slug (Data API forUsername
 * for /user, else scrape) → video (owner channel via player/scrape).
 */
export async function resolveChannelId(parsed: ParsedUrl, ctx: AppContext): Promise<string> {
  switch (parsed.type) {
    case "channel":
      return parsed.id!;

    case "handle": {
      if (ctx.dataApi.isEnabled()) {
        const ch = await ctx.dataApi.getChannelByHandle(parsed.handle!);
        if (ch?.id) return ch.id;
      }
      const { channelId } = await resolveHandleOrSlug(parsed.canonicalUrl);
      return channelId;
    }

    case "slug": {
      if (ctx.dataApi.isEnabled() && parsed.slugSource === "user") {
        const ch = await ctx.dataApi.getChannelByUsername(parsed.slug!);
        if (ch?.id) return ch.id;
      }
      const { channelId } = await resolveHandleOrSlug(parsed.canonicalUrl);
      return channelId;
    }

    case "video": {
      const player = await fetchVideoPlayer(parsed.id!).catch(() => null);
      if (player?.channelId) return player.channelId;
      const page = await scrapeYoutubePage(parsed.canonicalUrl);
      const basics = extractVideoPageBasics(page.ytInitialData, page.ytInitialPlayerResponse, page.html);
      if (basics.channelId) return basics.channelId;
      throw new VideoNotFoundError();
    }
  }
}

export interface ChannelBundle {
  channelId: string;
  signals: ChannelSignals;
  subscriberCount: number | null;
  videoCount: number | null;
  topics: string[];
  isFamilySafe: boolean | null;
  ytAdToken: boolean;
  dataApi: DataApiChannel | null;
  source: SignalSource;
}

/**
 * Fetch a full channel signal bundle: scrape the channel page (PRIMARY), browse InnerTube
 * for topics/family-safe, and optionally enrich with the Data API. Scrape/InnerTube always
 * win for monetization-relevant signals; the Data API only fills clean metadata gaps.
 */
export async function fetchChannelBundle(channelId: string, ctx: AppContext): Promise<ChannelBundle> {
  // Run the three independent sources concurrently — they don't depend on each other.
  const [page, browse, dataApi] = await Promise.all([
    scrapeYoutubePage(channelUrl(channelId)),
    browseChannel(channelId).catch(() => null),
    ctx.dataApi.isEnabled()
      ? ctx.dataApi.getChannelById(channelId).catch(() => null)
      : Promise.resolve<DataApiChannel | null>(null),
  ]);
  if (!page.ytInitialData) throw new ChannelNotFoundError();
  const signals = extractChannelSignals(page.ytInitialData, page.html);

  // Subscriber/video counts: prefer Data API exact figures, else parse scraped text.
  const subscriberCount =
    dataApi?.subscriberCount ??
    (signals.subscriberCountText ? parseSubscriberCountRaw(signals.subscriberCountText) : null);
  const videoCount =
    dataApi?.videoCount ?? (signals.videoCountText ? parseVideoCountRaw(signals.videoCountText) : null);

  return {
    channelId,
    signals,
    subscriberCount,
    videoCount,
    topics: browse?.topics ?? dataApi?.topicCategories ?? [],
    isFamilySafe: browse?.isFamilySafe ?? (dataApi?.madeForKids != null ? !dataApi.madeForKids : null),
    ytAdToken: browse?.ytAdToken ?? false,
    dataApi,
    source: combineSources("scrape", browse ? "innertube" : null, dataApi ? "api" : null),
  };
}

export interface VideoBundle {
  videoId: string;
  player: VideoPlayerResult | null;
  title: string | null;
  viewCount: number | null;
  durationSeconds: number | null;
  channelId: string | null;
  ownerAvatarUrl: string | null;
  ownerSubscriberText: string | null;
  ownerName: string | null;
  /** Ad/monetization signal (§0). PRIMARY = scraped watch-page player response. */
  adSignals: AdSignals;
  dataApi: DataApiVideo | null;
  source: SignalSource;
}

/**
 * Fetch a full video bundle. Ad signals come from the SCRAPED watch-page player response
 * (`extractAdSignals`) — the InnerTube `player` endpoint no longer returns ad data to
 * unauthenticated clients (it answers UNPLAYABLE). The InnerTube player is still used as a
 * best-effort fallback for ad count and for metadata.
 */
export async function fetchVideoBundle(videoId: string, ctx: AppContext): Promise<VideoBundle> {
  // Player (metadata), watch-page scrape (ads), and Data API all run concurrently.
  const [player, page, dataApiResult] = await Promise.all([
    fetchVideoPlayer(videoId).catch(() => null),
    scrapeYoutubePage(`https://www.youtube.com/watch?v=${videoId}`).catch(() => null),
    ctx.dataApi.isEnabled()
      ? ctx.dataApi.getVideoById(videoId).catch(() => null)
      : Promise.resolve<DataApiVideo | null>(null),
  ]);

  const basics = page
    ? extractVideoPageBasics(page.ytInitialData, page.ytInitialPlayerResponse, page.html)
    : { title: null, viewCount: 0, durationSeconds: 0, channelId: null };
  const owner = page?.ytInitialData
    ? extractVideoPageOwnerSignals(page.ytInitialData, page.html)
    : { avatarUrl: null, subscriberCountText: null, videoCountText: null, channelName: null };

  // Ad signal: scrape-primary, with the InnerTube player's adCount as a fallback (and so the
  // signal still works in tests where the player endpoint is mocked with ad data).
  const scrapeAds = extractAdSignals(page?.ytInitialPlayerResponse);
  const adSignals: AdSignals =
    scrapeAds.available && scrapeAds.adsEnabled
      ? scrapeAds
      : (player?.adCount ?? 0) > 0 || player?.playerAdsEnabled
        ? {
            ...scrapeAds,
            available: true,
            adPlacementCount: Math.max(scrapeAds.adPlacementCount, player?.adCount ?? 0),
            adRendererTypes: scrapeAds.adRendererTypes.length
              ? scrapeAds.adRendererTypes
              : (player?.adTypes ?? []),
            playerAdsEnabled: scrapeAds.playerAdsEnabled || Boolean(player?.playerAdsEnabled),
            adsEnabled: true,
          }
        : scrapeAds;

  const dataApi = dataApiResult;

  if (!player && !page?.ytInitialPlayerResponse && !dataApi) throw new VideoNotFoundError();

  return {
    videoId,
    player,
    title: dataApi?.title ?? player?.videoTitle ?? basics.title,
    viewCount: dataApi?.viewCount ?? player?.viewCount ?? basics.viewCount ?? null,
    durationSeconds: player?.duration || basics.durationSeconds || null,
    channelId: dataApi?.channelId ?? player?.channelId ?? basics.channelId,
    ownerAvatarUrl: owner.avatarUrl,
    ownerSubscriberText: owner.subscriberCountText,
    ownerName: dataApi?.channelTitle ?? owner.channelName,
    adSignals,
    dataApi,
    source: combineSources(page ? "scrape" : null, player ? "innertube" : null, dataApi ? "api" : null),
  };
}

/**
 * Sample a channel's monetization by reading the ad signal off its latest upload. Returns the
 * AdSignals (unavailable if the channel has no videos / page couldn't be read).
 */
export async function fetchChannelAdSignals(channelId: string, _ctx: AppContext): Promise<AdSignals> {
  const latestId = await fetchLatestVideoId(channelId).catch(() => null);
  if (!latestId) return extractAdSignals(null);
  // Lightweight: we only need the latest video's watch-page player response for ad signals —
  // skip the full video bundle (no extra player/Data-API calls).
  const page = await scrapeYoutubePage(`https://www.youtube.com/watch?v=${latestId}`).catch(() => null);
  return extractAdSignals(page?.ytInitialPlayerResponse);
}
