import type { ChannelIdResult, UrlRequest } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { resolveHandleOrSlug, extractChannelSignals, parseSubscriberCountRaw, parseVideoCountRaw, scrapeYoutubePage } from "../lib/youtube/scrape.js";
import { resolveChannelId, combineSources } from "./shared.js";
import type { SignalSource } from "@yt/validators";

export async function runChannelIdFinder(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<ChannelIdResult>> {
  const parsed = parseUrl(body.url);

  // Resolve the channel ID first (Data API path preferred where authoritative, §8 Tool 2).
  const channelId = await resolveChannelId(parsed, ctx);

  // Data API gives the cleanest, most complete metadata when available.
  if (ctx.dataApi.isEnabled()) {
    const ch = await ctx.dataApi.getChannelById(channelId).catch(() => null);
    if (ch) {
      const data: ChannelIdResult = {
        channelId: ch.id,
        channelUrl: `https://www.youtube.com/channel/${ch.id}`,
        handle: parsed.type === "handle" ? parsed.handle! : ch.customUrl?.startsWith("@") ? ch.customUrl : null,
        customUrl: ch.customUrl,
        userId: parsed.type === "slug" && parsed.slugSource === "user" ? parsed.slug! : null,
        channelTitle: ch.title,
        description: ch.description,
        thumbnailUrl: ch.thumbnailUrl,
        subscriberCount: ch.subscriberCount,
        videoCount: ch.videoCount,
        viewCount: ch.viewCount,
        country: ch.country,
        createdAt: ch.publishedAt,
        isVerified: false,
      };
      return { data, signalSource: "api" };
    }
  }

  // Scrape fallback.
  const page = await scrapeYoutubePage(`https://www.youtube.com/channel/${channelId}`).catch(() => null);
  const data0 = page?.ytInitialData ?? (await resolveHandleOrSlug(`https://www.youtube.com/channel/${channelId}`)).ytInitialData;
  const signals = extractChannelSignals(data0, page?.html ?? "");

  const sources: SignalSource[] = ["scrape"];
  const data: ChannelIdResult = {
    channelId,
    channelUrl: `https://www.youtube.com/channel/${channelId}`,
    handle: parsed.type === "handle" ? parsed.handle! : null,
    customUrl: null,
    userId: parsed.type === "slug" && parsed.slugSource === "user" ? parsed.slug! : null,
    channelTitle: signals.channelName,
    description: signals.description,
    thumbnailUrl: signals.avatarUrl,
    subscriberCount: signals.subscriberCountText ? parseSubscriberCountRaw(signals.subscriberCountText) : null,
    videoCount: signals.videoCountText ? parseVideoCountRaw(signals.videoCountText) : null,
    viewCount: null,
    country: signals.country,
    createdAt: null,
    isVerified: signals.isVerified,
  };
  return { data, signalSource: combineSources(...sources) };
}
