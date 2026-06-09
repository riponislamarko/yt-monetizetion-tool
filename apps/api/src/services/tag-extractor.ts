import type { TagExtractorResult, UrlRequest, SignalSource } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { scrapeYoutubePage } from "../lib/youtube/scrape.js";
import { fetchChannelBundle, resolveChannelId } from "./shared.js";

const VIDEO_TAG_LIMIT = 500;

/** Scrape video tags from ytInitialPlayerResponse keywords / meta keywords. */
function scrapeVideoTags(playerResponse: unknown, html: string): string[] {
  const kws = (playerResponse as { videoDetails?: { keywords?: string[] } })?.videoDetails?.keywords;
  if (Array.isArray(kws) && kws.length) return kws;
  const m = html.match(/<meta name="keywords" content="([^"]*)"/i);
  if (m?.[1]) return m[1].split(",").map((t) => t.trim()).filter(Boolean);
  return [];
}

export async function runTagExtractor(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<TagExtractorResult>> {
  const parsed = parseUrl(body.url);

  if (parsed.type === "video") {
    let tags: string[] = [];
    let title: string | null = null;
    let source: SignalSource = "scrape";

    if (ctx.dataApi.isEnabled()) {
      const v = await ctx.dataApi.getVideoById(parsed.id!).catch(() => null);
      if (v) {
        tags = v.tags;
        title = v.title;
        source = "api";
      }
    }
    if (!tags.length) {
      const page = await scrapeYoutubePage(parsed.canonicalUrl);
      tags = scrapeVideoTags(page.ytInitialPlayerResponse, page.html);
      title = title ?? page.ytInitialPlayerResponse?.videoDetails?.title ?? null;
      source = source === "api" ? "mixed" : "scrape";
    }

    const totalCharacters = tags.join("").length;
    const data: TagExtractorResult = {
      type: "video",
      title,
      tags,
      tagCount: tags.length,
      totalCharacters,
      remainingCharacters: VIDEO_TAG_LIMIT - totalCharacters,
      copyableString: tags.join(", "),
    };
    return { data, signalSource: source };
  }

  // Channel keywords (brandingSettings.channel.keywords) — already parsed by the bundle.
  const channelId = await resolveChannelId(parsed, ctx);
  const c = await fetchChannelBundle(channelId, ctx);
  const tags = c.signals.keywords.length ? c.signals.keywords : (c.dataApi?.keywords ?? []);
  const totalCharacters = tags.join("").length;

  const data: TagExtractorResult = {
    type: "channel",
    title: c.signals.channelName ?? c.dataApi?.title ?? null,
    tags,
    tagCount: tags.length,
    totalCharacters,
    remainingCharacters: null, // channels have no documented keyword char limit
    copyableString: tags.join(", "),
  };
  return { data, signalSource: c.dataApi?.keywords.length && !c.signals.keywords.length ? "api" : "scrape" };
}
