import { HEADERS, delayBetweenYoutubeRequests } from "./scrape.js";
import { ScrapingError } from "@yt/validators/errors";

/**
 * InnerTube (private YouTube API) client. PRIMARY source for ad/monetization signals (§0):
 * the public Data API cannot expose these. Ported from the prototype's innertube.js.
 */

type YtNode = any;

const INNERTUBE_URL = "https://www.youtube.com/youtubei/v1";
// Public InnerTube web key — embedded in youtube.com's own client, not a secret credential.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const CLIENT_WEB = { clientName: "WEB", clientVersion: "2.20240101.00.00", hl: "en", gl: "US" };

const FETCH_TIMEOUT_MS = 8000;

function contextFor(client: typeof CLIENT_WEB) {
  return { client };
}

async function innertubePost(path: string, body: unknown): Promise<YtNode> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${INNERTUBE_URL}/${path}?key=${INNERTUBE_KEY}`, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new ScrapingError(`InnerTube ${path} HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function walk(obj: YtNode, depth: number, visit: (n: YtNode) => void): void {
  if (!obj || depth > 35) return;
  visit(obj);
  if (Array.isArray(obj)) {
    for (const x of obj) walk(x, depth + 1, visit);
  } else if (typeof obj === "object") {
    for (const k of Object.keys(obj)) walk(obj[k], depth + 1, visit);
  }
}

function extractTopics(response: YtNode): string[] {
  const out = new Set<string>();
  walk(response, 0, (node) => {
    if (node?.metadata?.title?.simpleText && node?.style === "CHANNEL_TAB_STYLE_TOPIC") {
      out.add(node.metadata.title.simpleText);
    }
    if (typeof node?.title?.simpleText === "string" && String(node?.style ?? "").includes("TOPIC")) {
      out.add(node.title.simpleText);
    }
  });
  return [...out].slice(0, 24);
}

function extractFamilySafe(response: YtNode): boolean | null {
  const str = JSON.stringify(response);
  if (str.includes('"isFamilySafe":false')) return false;
  if (str.includes('"isFamilySafe":true')) return true;
  return null;
}

export function detectYtAdToken(raw: string): boolean {
  const lower = String(raw).toLowerCase();
  return (
    lower.includes("adslot") ||
    lower.includes("ad_slot") ||
    lower.includes("adplacement") ||
    lower.includes("ad_format") ||
    lower.includes("preroll") ||
    lower.includes("midroll") ||
    lower.includes("postroll") ||
    lower.includes("ytad") ||
    lower.includes("playerads")
  );
}

function placementKindToType(kind: unknown): string {
  const s = String(kind ?? "").toUpperCase();
  if (s.includes("MID")) return "MID_ROLL";
  if (s.includes("POST")) return "POST_ROLL";
  return "PRE_ROLL";
}

interface PlayerAdInfo {
  adCount: number;
  adTypes: string[];
  playerAdsEnabled: boolean;
  adBreakOffsets: number[];
}

function extractPlayerAdInfo(response: YtNode): PlayerAdInfo {
  const placements = response?.adPlacements;
  const types: string[] = [];
  const adBreakOffsets: number[] = [];
  let adCount = 0;

  if (Array.isArray(placements)) {
    adCount = placements.length;
    for (const p of placements) {
      const ar = p?.adPlacementRenderer;
      const kind =
        ar?.config?.adPlacementConfig?.kind ?? ar?.config?.adPlacementConfig?.adFormat ?? ar?.adFormat ?? "";
      types.push(placementKindToType(kind));
      walk(ar, 0, (n) => {
        if (typeof n?.adBreakTimeSeconds === "number") adBreakOffsets.push(n.adBreakTimeSeconds);
        if (typeof n?.startTimeSeconds === "number" && String(kind).toUpperCase().includes("MID")) {
          adBreakOffsets.push(n.startTimeSeconds);
        }
      });
    }
  }

  if (Array.isArray(response?.cueRanges)) {
    for (const c of response.cueRanges) {
      if (typeof c?.startTimeSeconds === "number") adBreakOffsets.push(c.startTimeSeconds);
    }
  }

  const uniqueOffsets = [...new Set(adBreakOffsets.filter((n) => !Number.isNaN(n)))].sort((a, b) => a - b);
  return { adCount, adTypes: types, playerAdsEnabled: !!response?.playerAds, adBreakOffsets: uniqueOffsets };
}

export interface BrowseChannelResult {
  topics: string[];
  isFamilySafe: boolean | null;
  ytAdToken: boolean;
}

export async function browseChannel(channelId: string): Promise<BrowseChannelResult> {
  await delayBetweenYoutubeRequests();
  const response = await innertubePost("browse", { context: contextFor(CLIENT_WEB), browseId: channelId });
  return {
    topics: extractTopics(response),
    isFamilySafe: extractFamilySafe(response),
    ytAdToken: detectYtAdToken(JSON.stringify(response)),
  };
}

export interface VideoPlayerResult {
  videoTitle: string | null;
  duration: number;
  viewCount: number;
  channelId: string | null;
  adCount: number;
  adTypes: string[];
  playerAdsEnabled: boolean;
  adBreakOffsets: number[];
}

export async function fetchVideoPlayer(videoId: string): Promise<VideoPlayerResult> {
  await delayBetweenYoutubeRequests();
  // Single WEB call. The InnerTube player no longer returns ad data to unauthenticated
  // clients (it answers UNPLAYABLE), and the old ANDROID fallback now 400s — so we don't pay
  // for it. Ads come from the watch-page scrape (extractAdSignals); this call is only a
  // best-effort metadata source (title/duration/views/channelId).
  const response = await innertubePost("player", { context: contextFor(CLIENT_WEB), videoId });
  const adInfo = extractPlayerAdInfo(response);
  const details = response.videoDetails ?? {};

  return {
    videoTitle: details.title ?? null,
    duration: Number(details.lengthSeconds) || 0,
    viewCount: Number(details.viewCount) || 0,
    channelId: details.channelId ?? null,
    adCount: adInfo.adCount,
    adTypes: adInfo.adTypes,
    playerAdsEnabled: adInfo.playerAdsEnabled,
    adBreakOffsets: adInfo.adBreakOffsets,
  };
}
