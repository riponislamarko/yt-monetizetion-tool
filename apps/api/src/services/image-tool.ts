import type { ImageToolResult, UrlRequest, SignalSource } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { headCheckAll } from "../lib/http.js";
import { fetchChannelBundle, fetchVideoBundle, resolveChannelId } from "./shared.js";

/** Deterministic video thumbnail qualities (no API needed). */
const VIDEO_THUMBS: Array<{ label: string; q: string; width: number; height: number }> = [
  { label: "Max Resolution", q: "maxresdefault", width: 1280, height: 720 },
  { label: "Standard Definition", q: "sddefault", width: 640, height: 480 },
  { label: "High Quality", q: "hqdefault", width: 480, height: 360 },
  { label: "Medium Quality", q: "mqdefault", width: 320, height: 180 },
  { label: "Default", q: "default", width: 120, height: 90 },
];

/** Common channel banner render sizes — we PROBE each rather than assert availability (§8). */
const BANNER_WIDTHS = [2560, 2120, 1707, 1138, 1060, 320];

/** Strip any existing `=...` sizing segment to get the bare image root (everything before it). */
function imageRoot(url: string): string {
  return url.split("=")[0]!;
}

/** Build an avatar URL at a square size. Works whether or not the base already has a size tag. */
function avatarUrlForSize(url: string, size: number): string {
  return `${imageRoot(url)}=s${size}-c-k-c0x00ffffff-no-rj`;
}

/** Build a channel banner URL at a given width (full-frame crop). */
function bannerUrlForWidth(url: string, width: number): string {
  return `${imageRoot(url)}=w${width}-fcrop64=1,00000000ffffffff-k-c0xffffffff-no-nd-rj`;
}

export async function runImageTool(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<ImageToolResult>> {
  const parsed = parseUrl(body.url);

  if (parsed.type === "video") {
    const v = await fetchVideoBundle(parsed.id!, ctx);
    const urls = VIDEO_THUMBS.map((t) => `https://i.ytimg.com/vi/${v.videoId}/${t.q}.jpg`);
    const checks = await headCheckAll(urls);
    const thumbnails = VIDEO_THUMBS.map((t, i) => ({
      label: t.label,
      url: urls[i]!,
      width: t.width,
      height: t.height,
      available: checks[i]!.available,
    }));
    const data: ImageToolResult = {
      type: "video",
      channelTitle: v.ownerName,
      videoTitle: v.title,
      thumbnails,
      profilePictures: [],
      bannerImages: [],
    };
    return { data, signalSource: "computed" };
  }

  // Channel: avatar + banner. Prefer Data API/scrape source URLs, then probe sizes.
  const channelId = await resolveChannelId(parsed, ctx);
  const c = await fetchChannelBundle(channelId, ctx);

  const avatarBase = c.signals.avatarUrl ?? c.dataApi?.thumbnailUrl ?? null;
  const profileSizes = [800, 400, 176, 88, 48];
  let profilePictures: ImageToolResult["profilePictures"] = [];
  if (avatarBase) {
    const urls = profileSizes.map((s) => avatarUrlForSize(avatarBase, s));
    const checks = await headCheckAll(urls);
    profilePictures = profileSizes.map((s, i) => ({
      label: `${s}x${s}`,
      url: urls[i]!,
      width: s,
      height: s,
      available: checks[i]!.available,
    }));
  }

  const bannerBase = c.signals.bannerUrl ?? c.dataApi?.bannerUrl ?? null;
  let bannerImages: ImageToolResult["bannerImages"] = [];
  if (bannerBase) {
    const urls = BANNER_WIDTHS.map((w) => bannerUrlForWidth(bannerBase, w));
    const checks = await headCheckAll(urls);
    // Only emit banner sizes that actually resolve (§8 — probe, don't assert a fixed list).
    bannerImages = BANNER_WIDTHS.map((w, i) => ({
      label: `${w}px wide`,
      url: urls[i]!,
      width: w,
      height: Math.round((w * 9) / 16), // YouTube banners are 16:9 (e.g. 2560×1440)
      available: checks[i]!.available,
    })).filter((b) => b.available);
  }

  const source: SignalSource = c.dataApi ? "mixed" : "scrape";
  const data: ImageToolResult = {
    type: "channel",
    channelTitle: c.signals.channelName ?? c.dataApi?.title ?? null,
    videoTitle: null,
    thumbnails: [],
    profilePictures,
    bannerImages,
  };
  return { data, signalSource: source };
}
