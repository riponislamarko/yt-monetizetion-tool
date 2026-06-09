import type { ThumbnailResult, UrlRequest, SignalSource } from "@yt/validators";
import { InvalidUrlError } from "@yt/validators/errors";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { headCheckAll } from "../lib/http.js";
import { scrapeYoutubePage } from "../lib/youtube/scrape.js";

const QUALITIES: Array<{ quality: string; label: string; file: string; width: number; height: number }> = [
  { quality: "maxres", label: "Max Resolution (1280×720)", file: "maxresdefault", width: 1280, height: 720 },
  { quality: "sd", label: "Standard Definition (640×480)", file: "sddefault", width: 640, height: 480 },
  { quality: "hq", label: "High Quality (480×360)", file: "hqdefault", width: 480, height: 360 },
  { quality: "mq", label: "Medium Quality (320×180)", file: "mqdefault", width: 320, height: 180 },
  { quality: "default", label: "Default (120×90)", file: "default", width: 120, height: 90 },
];

export async function runThumbnailDownloader(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<ThumbnailResult>> {
  const parsed = parseUrl(body.url);
  if (parsed.type !== "video") throw new InvalidUrlError("Provide a video URL or ID.");
  const videoId = parsed.id!;

  const urls = QUALITIES.map((q) => `https://i.ytimg.com/vi/${videoId}/${q.file}.jpg`);
  const checks = await headCheckAll(urls);
  const thumbnails = QUALITIES.map((q, i) => ({
    quality: q.quality,
    label: q.label,
    url: urls[i]!,
    width: q.width,
    height: q.height,
    available: checks[i]!.available,
    fileSize: checks[i]!.fileSize,
  }));

  let videoTitle: string | null = null;
  let channelTitle: string | null = null;
  let channelId: string | null = null;
  let source: SignalSource = "computed";

  if (ctx.dataApi.isEnabled()) {
    const v = await ctx.dataApi.getVideoById(videoId).catch(() => null);
    if (v) {
      videoTitle = v.title;
      channelTitle = v.channelTitle;
      channelId = v.channelId;
      source = "api";
    }
  }
  if (!videoTitle) {
    const page = await scrapeYoutubePage(parsed.canonicalUrl).catch(() => null);
    if (page?.ytInitialPlayerResponse?.videoDetails) {
      const d = page.ytInitialPlayerResponse.videoDetails;
      videoTitle = d.title ?? null;
      channelTitle = channelTitle ?? d.author ?? null;
      channelId = channelId ?? d.channelId ?? null;
      source = source === "api" ? "mixed" : "scrape";
    }
  }

  const data: ThumbnailResult = { videoId, videoTitle, channelTitle, channelId, thumbnails };
  return { data, signalSource: source };
}
