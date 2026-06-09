import { ScrapingError } from "@yt/validators/errors";

/**
 * Ported and hardened from the prototype's scrapeYoutube.js. This is the PRIMARY data
 * source for channel/video signals (§0). Raw YouTube JSON is genuinely untyped 3rd-party
 * data, so internal walkers operate on `unknown`/loose shapes; the exported surface is typed.
 */

// Raw YouTube response nodes — deliberately loose; YouTube changes shape frequently.
type YtNode = any;

export const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const FETCH_TIMEOUT_MS = 8000;

function randomDelayMs(): number {
  // Small politeness jitter (ToS mitigation, §0). Kept short because the services now run
  // independent requests in PARALLEL — a large sequential delay used to dominate latency.
  return 80 + Math.floor(Math.random() * (220 - 80 + 1));
}

/** Light jittered delay between YouTube requests (ToS mitigation, §0). No-op in tests. */
export async function delayBetweenYoutubeRequests(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  await new Promise((r) => setTimeout(r, randomDelayMs()));
}

async function fetchHtml(pageUrl: string): Promise<string> {
  let url = pageUrl;
  try {
    const u = new URL(pageUrl);
    u.searchParams.set("hl", "en");
    u.searchParams.set("gl", "US");
    url = u.toString();
  } catch {
    /* keep original */
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new ScrapingError(`YouTube returned HTTP ${res.status}.`);
    return await res.text();
  } catch (err) {
    if (err instanceof ScrapingError) throw err;
    throw new ScrapingError("Failed to fetch the YouTube page.", err);
  } finally {
    clearTimeout(t);
  }
}

/**
 * Match a balanced JSON object starting at the `{` at/after `from`, correctly skipping braces
 * that appear inside string literals (and escaped quotes). Returns the object substring or null.
 *
 * WHY this replaced the old `;</script>` boundary: on the WATCH page, `ytInitialPlayerResponse`
 * is followed by more JavaScript in the same <script>, so cutting at the next `;</script>`
 * captured trailing code and JSON.parse failed — which is exactly why ad signals weren't read.
 */
function matchBalancedObject(html: string, from: number): string | null {
  const start = html.indexOf("{", from);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

/** Try several assignment forms YouTube uses, then brace-match the object. */
function extractAssignedJson(html: string, varName: string): YtNode | null {
  const needles = [
    `var ${varName} = `,
    `${varName} = `,
    `window["${varName}"] = `,
    `"${varName}":`,
  ];
  for (const needle of needles) {
    let searchFrom = 0;
    for (;;) {
      const idx = html.indexOf(needle, searchFrom);
      if (idx === -1) break;
      const raw = matchBalancedObject(html, idx + needle.length);
      if (raw) {
        try {
          return JSON.parse(raw) as YtNode;
        } catch {
          /* try next occurrence/needle */
        }
      }
      searchFrom = idx + needle.length;
    }
  }
  return null;
}

export function extractYtInitialData(html: string): YtNode | null {
  return extractAssignedJson(html, "ytInitialData");
}

export function extractYtInitialPlayerResponse(html: string): YtNode | null {
  return extractAssignedJson(html, "ytInitialPlayerResponse");
}

function walkNodes(obj: YtNode, depth: number, visit: (n: YtNode) => void): void {
  if (!obj || depth > 40) return;
  visit(obj);
  if (Array.isArray(obj)) {
    for (const x of obj) walkNodes(x, depth + 1, visit);
  } else if (typeof obj === "object") {
    for (const k of Object.keys(obj)) walkNodes(obj[k], depth + 1, visit);
  }
}

function pickLargestThumbnail(thumbnails: YtNode): string | null {
  const list = thumbnails?.thumbnails;
  if (!Array.isArray(list) || !list.length) return null;
  return list[list.length - 1]?.url ?? list[0]?.url ?? null;
}

function pickLargestImageSource(sources: YtNode): string | null {
  if (!Array.isArray(sources) || !sources.length) return null;
  const withUrl = sources.filter((s: YtNode) => s && typeof s.url === "string");
  if (!withUrl.length) return null;
  withUrl.sort((a: YtNode, b: YtNode) => (Number(b.width) || 0) - (Number(a.width) || 0));
  return withUrl[0].url;
}

function deepFindChannelId(obj: YtNode, depth = 0): string | null {
  if (!obj || depth > 25) return null;
  if (typeof obj === "string") return /^UC[\w-]{10,}$/.test(obj) ? obj : null;
  if (typeof obj !== "object") return null;
  if (obj.channelId && /^UC[\w-]{10,}$/.test(String(obj.channelId))) return String(obj.channelId);
  if (obj.externalId && /^UC[\w-]{10,}$/.test(String(obj.externalId))) return String(obj.externalId);
  for (const k of Object.keys(obj)) {
    const found = deepFindChannelId(obj[k], depth + 1);
    if (found) return found;
  }
  return null;
}

function textFromAccessibleText(obj: YtNode): string | null {
  if (obj == null) return null;
  if (typeof obj === "string") return obj.trim() || null;
  if (typeof obj !== "object") return null;
  if (typeof obj.content === "string" && obj.content.trim()) return obj.content.trim();
  if (typeof obj.simpleText === "string" && obj.simpleText.trim()) return obj.simpleText.trim();
  if (Array.isArray(obj.runs)) {
    const t = obj.runs.map((r: YtNode) => (r && r.text) || "").join("");
    if (t.trim()) return t.trim();
  }
  if (obj.text) return textFromAccessibleText(obj.text);
  return null;
}

function joinMetadataRowParts(row: YtNode): string | null {
  const parts = row?.metadataParts;
  if (!Array.isArray(parts)) return null;
  const pieces = parts
    .map((p: YtNode) => textFromAccessibleText(p?.text) || textFromAccessibleText(p))
    .filter(Boolean);
  return pieces.length ? pieces.join(" · ") : null;
}

function findPageHeaderStatsRow(ytInitialData: YtNode): string | null {
  const phvm = ytInitialData?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  const rows = phvm?.metadata?.contentMetadataViewModel?.metadataRows;
  if (!Array.isArray(rows)) return null;
  for (const row of rows) {
    const joined = joinMetadataRowParts(row);
    if (joined && /\bsubscribers?\b|\bvideos?\b/i.test(joined)) return joined;
  }
  return null;
}

function splitStatsRow(line: string | null): { subscribers: string | null; videos: string | null } {
  if (!line) return { subscribers: null, videos: null };
  const parts = line
    .split(/\s*·\s*|\s*•\s*|\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  let subscribers: string | null = null;
  let videos: string | null = null;
  for (const p of parts) {
    if (subscribers == null && /\bsubscribers?\b/i.test(p) && /\d/.test(p)) subscribers = p;
    else if (videos == null && /\bvideos?\b/i.test(p) && !/view/i.test(p) && /\d/.test(p)) videos = p;
  }
  return { subscribers, videos };
}

function isLikelyChannelSubscriberLine(t: string | null): boolean {
  if (!t) return false;
  const s = t.trim();
  if (s.length < 6 || !/\d/.test(s) || !/\bsubscribers?\b/i.test(s)) return false;
  if (/^subscribe$/i.test(s) || /^subscribed$/i.test(s) || /^join$/i.test(s)) return false;
  return true;
}

function pickFirstSubscriberLine(candidates: string[]): string | null {
  for (const t of candidates) if (isLikelyChannelSubscriberLine(t)) return t;
  return null;
}

function extractSubscriberStringsFromHtml(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  const reSimple = /"subscriberCountText"\s*:\s*\{\s*"simpleText"\s*:\s*"((?:\\"|[^"])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = reSimple.exec(html)) !== null) {
    out.push(m[1]!.replace(/\\"/g, '"').replace(/\\n/g, " "));
  }
  const reRunsBlock = /"subscriberCountText"\s*:\s*\{\s*"runs"\s*:\s*\[/g;
  while ((m = reRunsBlock.exec(html)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    for (; i < html.length && depth > 0; i++) {
      const c = html[i];
      if (c === "[") depth++;
      else if (c === "]") depth--;
    }
    const inner = html.slice(start, i - 1);
    const texts: string[] = [];
    const rt = /"text"\s*:\s*"((?:\\"|[^"])*)"/g;
    let rm: RegExpExecArray | null;
    while ((rm = rt.exec(inner)) !== null) texts.push(rm[1]!.replace(/\\"/g, '"'));
    if (texts.length) out.push(texts.join(""));
  }
  return out;
}

function extractSubscriberLinesFromRawHtml(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\b\d[\d.,]*\s*[KMBkmb]?\s*subscribers\b/gi;
  while ((m = re.exec(html)) !== null) {
    const t = m[0].replace(/\s+/g, " ").trim();
    if (t.length >= 8 && t.length <= 80) out.push(t);
  }
  const re2 = /\b\d[\d.,]*\s*(?:million|billion|thousand)\s+subscribers\b/gi;
  while ((m = re2.exec(html)) !== null) {
    const t = m[0].replace(/\s+/g, " ").trim();
    if (t.length >= 10 && t.length <= 80) out.push(t);
  }
  return out;
}

function extractVideoLinesFromRawHtml(html: string): string[] {
  if (!html) return [];
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = /\b\d[\d.,]*\s*[KMBkmb]?\s+videos\b/gi;
  while ((m = re.exec(html)) !== null) {
    const t = m[0].replace(/\s+/g, " ").trim();
    if (t.length >= 6 && t.length <= 60 && !/view/i.test(t)) out.push(t);
  }
  const re2 = /\b\d[\d.,]*\s*(?:million|billion|thousand)\s+videos\b/gi;
  while ((m = re2.exec(html)) !== null) {
    const t = m[0].replace(/\s+/g, " ").trim();
    if (t.length >= 8 && t.length <= 60) out.push(t);
  }
  return out;
}

function isLikelyVideoCountLine(t: string | null): boolean {
  if (!t) return false;
  const s = t.trim();
  if (/view/i.test(s) || s.length > 40 || !/\bvideos\b/i.test(s) || !/\d/.test(s)) return false;
  return true;
}

function findSimpleTextMatching(
  root: YtNode,
  pred: (t: string) => boolean,
  mode: "shortest" | "longest" = "shortest",
): string | null {
  let found: string | null = null;
  walkNodes(root, 0, (node) => {
    const t = node?.simpleText;
    if (typeof t === "string" && pred(t)) {
      if (!found) found = t;
      else if (mode === "longest" ? t.length > found.length : t.length < found.length) found = t;
    }
  });
  return found;
}

function parseKeywordString(value: unknown): string[] {
  const input = String(value ?? "").trim();
  if (!input) return [];
  const matches = input.match(/"([^"]+)"|'([^']+)'|[^\s,]+/g) ?? [];
  return matches.map((part) => part.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

/* ----------------------------- numeric parsers ----------------------------- */

export function parseViewCountRaw(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase().replace(/,/g, "").replace(/views?/gi, "").trim();
  if (!t || !/\d/.test(t)) return 0;
  const mult = t.includes("b") ? 1e9 : t.includes("m") ? 1e6 : t.includes("k") ? 1e3 : 1;
  const num = parseFloat(t.replace(/[^\d.]/g, ""));
  return Number.isNaN(num) ? 0 : Math.round(num * mult);
}

export function parseSubscriberCountRaw(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase().replace(/,/g, "").replace(/subscribers?/gi, "").trim();
  if (!t || t === "no" || t.includes("hidden")) return 0;
  const mult = t.includes("m") ? 1e6 : t.includes("k") ? 1e3 : t.includes("b") ? 1e9 : 1;
  const num = parseFloat(t.replace(/[^\d.]/g, ""));
  return Number.isNaN(num) ? 0 : Math.round(num * mult);
}

export function parseVideoCountRaw(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase().replace(/,/g, "").replace(/videos?/gi, "").trim();
  const mult = t.includes("k") ? 1e3 : t.includes("m") ? 1e6 : 1;
  const num = parseFloat(t.replace(/[^\d.]/g, ""));
  return Number.isNaN(num) ? 0 : Math.round(num * mult);
}

/* ----------------------------- public extractors ----------------------------- */

export interface ChannelSignals {
  channelName: string | null;
  subscriberCountText: string | null;
  videoCountText: string | null;
  description: string | null;
  keywords: string[];
  country: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  hasJoinButton: boolean;
  isVerified: boolean;
  isMadeForKids: boolean;
  channelId: string | null;
}

export interface VideoOwnerSignals {
  avatarUrl: string | null;
  subscriberCountText: string | null;
  videoCountText: string | null;
  channelName: string | null;
}

export interface VideoPageBasics {
  title: string | null;
  viewCount: number;
  durationSeconds: number;
  channelId: string | null;
}

/**
 * Ad / monetization signal derived from a video's `ytInitialPlayerResponse` (§0 PRIMARY).
 *
 * WHY this works when InnerTube doesn't: YouTube hardened the InnerTube `player` endpoint
 * (it returns UNPLAYABLE with no ad data to unauthenticated clients, and now wants a PoToken),
 * but the logged-out WATCH PAGE still embeds a player response whose `adPlacements` array is
 * populated ONLY for monetized videos — a non-monetized/ads-off video has no `adPlacements`
 * at all. Empirically: monetized videos carry a `clientForecastingAdRenderer` (the reserved
 * ad slot); non-monetized ones carry none. That reservation is the most reliable public proxy
 * for "monetization is active on this video".
 */
export interface AdSignals {
  /** Whether we could read a usable player response at all. */
  available: boolean;
  playabilityStatus: string | null;
  /** Number of ad placements (reserved slots) on the video. */
  adPlacementCount: number;
  /** Distinct ad-placement renderer types (e.g. clientForecastingAdRenderer). */
  adRendererTypes: string[];
  /** A reserved ad slot exists — the strongest public monetization proxy. */
  hasForecastingAd: boolean;
  /** An actual instream video ad renderer is present (rare while logged out, but definitive). */
  hasInstreamAd: boolean;
  /** Legacy desktop watch-ads flag. */
  playerAdsEnabled: boolean;
  /** The monetization verdict from this layer: an ad slot is reserved on the video. */
  adsEnabled: boolean;
}

const REAL_AD_RENDERER_RE = /instreamVideoAdRenderer|linearAdSequenceRenderer/;

export function extractAdSignals(playerResponse: YtNode): AdSignals {
  const empty: AdSignals = {
    available: false,
    playabilityStatus: null,
    adPlacementCount: 0,
    adRendererTypes: [],
    hasForecastingAd: false,
    hasInstreamAd: false,
    playerAdsEnabled: false,
    adsEnabled: false,
  };
  if (!playerResponse || typeof playerResponse !== "object") return empty;

  const status: string | null = playerResponse?.playabilityStatus?.status ?? null;
  const placements = Array.isArray(playerResponse.adPlacements) ? playerResponse.adPlacements : [];
  const types = new Set<string>();
  for (const p of placements) {
    const r = p?.adPlacementRenderer?.renderer;
    if (r && typeof r === "object") {
      const k = Object.keys(r)[0];
      if (k) types.add(k);
    }
  }
  const adRendererTypes = [...types];
  const hasForecastingAd = adRendererTypes.includes("clientForecastingAdRenderer");
  const hasInstreamAd = adRendererTypes.some((t) => REAL_AD_RENDERER_RE.test(t));
  const playerAdsEnabled = Boolean(playerResponse.playerAds);
  // An ad slot reserved (forecasting), a real ad renderer, or the legacy flag all mean ads run.
  const adsEnabled = placements.length > 0 || hasInstreamAd || playerAdsEnabled;

  return {
    available: true,
    playabilityStatus: status,
    adPlacementCount: placements.length,
    adRendererTypes,
    hasForecastingAd,
    hasInstreamAd,
    playerAdsEnabled,
    adsEnabled,
  };
}

/** Extract the most recent uploaded video ID from a channel's /videos page HTML. */
export function extractFirstVideoId(html: string): string | null {
  const m = /"videoId":"([\w-]{11})"/.exec(html);
  return m?.[1] ?? null;
}

/** Fetch a channel's latest video ID (for sampling ad signals on channel-level checks). */
export async function fetchLatestVideoId(channelId: string): Promise<string | null> {
  await delayBetweenYoutubeRequests();
  const html = await fetchHtml(`https://www.youtube.com/channel/${channelId}/videos`).catch(() => "");
  return extractFirstVideoId(html);
}

export interface ScrapedPage {
  html: string;
  ytInitialData: YtNode | null;
  ytInitialPlayerResponse: YtNode | null;
}

export async function scrapeYoutubePage(pageUrl: string): Promise<ScrapedPage> {
  const html = await fetchHtml(pageUrl);
  return {
    html,
    ytInitialData: extractYtInitialData(html),
    ytInitialPlayerResponse: extractYtInitialPlayerResponse(html),
  };
}

export async function resolveHandleOrSlug(
  canonicalUrl: string,
): Promise<{ channelId: string; ytInitialData: YtNode; html: string }> {
  const html = await fetchHtml(canonicalUrl);
  const data = extractYtInitialData(html);
  if (!data) throw new ScrapingError("Could not read the channel page data.");
  const id = deepFindChannelId(data.metadata) ?? deepFindChannelId(data);
  if (!id) throw new ScrapingError("Could not resolve a channel ID from this URL.");
  return { channelId: id, ytInitialData: data, html };
}

export function extractVideoPageOwnerSignals(ytInitialData: YtNode, _html = ""): VideoOwnerSignals {
  const out: VideoOwnerSignals = {
    avatarUrl: null,
    subscriberCountText: null,
    videoCountText: null,
    channelName: null,
  };
  if (!ytInitialData) return out;

  const owners: YtNode[] = [];
  walkNodes(ytInitialData, 0, (node) => {
    if (node?.videoOwnerRenderer?.thumbnail?.thumbnails?.length) owners.push(node.videoOwnerRenderer);
  });

  const vo = owners[0];
  if (vo) {
    out.avatarUrl = pickLargestThumbnail(vo.thumbnail);
    out.subscriberCountText = textFromAccessibleText(vo.subscriberCountText);
    out.channelName = textFromAccessibleText(vo.title) ?? vo.title?.simpleText ?? null;
  }
  return out;
}

export function extractChannelSignals(ytInitialData: YtNode, html = ""): ChannelSignals {
  const empty: ChannelSignals = {
    channelName: null,
    subscriberCountText: null,
    videoCountText: null,
    description: null,
    keywords: [],
    country: null,
    avatarUrl: null,
    bannerUrl: null,
    hasJoinButton: false,
    isVerified: false,
    isMadeForKids: false,
    channelId: null,
  };
  if (!ytInitialData) return empty;

  const meta = ytInitialData.metadata?.channelMetadataRenderer ?? {};
  const channelName = meta.title ?? null;
  const description = meta.description ?? null;
  const country = meta.country ?? null;

  let keywords: string[] = [];
  if (typeof meta.keywords === "string") keywords = parseKeywordString(meta.keywords);
  else if (Array.isArray(meta.keywords))
    keywords = meta.keywords.map(String).map((k: string) => k.trim()).filter(Boolean);

  const header = ytInitialData.header;
  const c4 = header?.c4TabbedHeaderRenderer;
  const phvm = header?.pageHeaderRenderer?.content?.pageHeaderViewModel;

  let avatarUrl =
    pickLargestThumbnail(meta.avatar) ??
    pickLargestThumbnail(c4?.avatar) ??
    pickLargestThumbnail(c4?.thumbnail) ??
    null;
  if (!avatarUrl && phvm?.image?.sources) avatarUrl = pickLargestImageSource(phvm.image.sources);

  let bannerUrl: string | null = null;
  if (c4?.banner?.thumbnails) bannerUrl = pickLargestThumbnail(c4.banner);
  const bannerFromPh = phvm?.banner?.image?.sources;
  if (!bannerUrl && Array.isArray(bannerFromPh) && bannerFromPh.length)
    bannerUrl = pickLargestImageSource(bannerFromPh);

  const statsParts = splitStatsRow(findPageHeaderStatsRow(ytInitialData));

  const subscriberCandidates: string[] = [];
  const pushSub = (t: string | null) => {
    const x = t?.trim();
    if (x) subscriberCandidates.push(x);
  };
  pushSub(statsParts.subscribers);
  pushSub(textFromAccessibleText(c4?.subscriberCountText));
  pushSub(
    typeof meta.subscriberCountText === "string"
      ? meta.subscriberCountText
      : textFromAccessibleText(meta.subscriberCountText),
  );
  walkNodes(ytInitialData, 0, (node) => {
    if (node?.subscriberCountText) pushSub(textFromAccessibleText(node.subscriberCountText));
  });
  for (const h of extractSubscriberStringsFromHtml(html)) pushSub(h);
  for (const line of extractSubscriberLinesFromRawHtml(html)) pushSub(line);

  const subscriberCountText = pickFirstSubscriberLine(subscriberCandidates);

  const videoCandidates: string[] = [];
  const pushVid = (t: string | null) => {
    const x = t?.trim();
    if (x) videoCandidates.push(x);
  };
  pushVid(statsParts.videos);
  pushVid(textFromAccessibleText(c4?.videosCountText));
  walkNodes(ytInitialData, 0, (node) => {
    if (node?.videosCountText) pushVid(textFromAccessibleText(node.videosCountText));
  });
  for (const v of extractVideoLinesFromRawHtml(html)) pushVid(v);

  let videoCountText: string | null = null;
  for (const v of videoCandidates) {
    if (isLikelyVideoCountLine(v)) {
      videoCountText = v;
      break;
    }
  }

  const str = JSON.stringify(ytInitialData);
  const hasJoinButton = str.includes('"joinButton"');
  const isVerified = str.includes('"BADGE_STYLE_TYPE_VERIFIED"');
  const isMadeForKids = meta.isFamilySafe === false;

  const channelId =
    meta.externalId && /^UC[\w-]{10,}$/.test(meta.externalId)
      ? meta.externalId
      : deepFindChannelId(ytInitialData);

  return {
    channelName,
    subscriberCountText,
    videoCountText,
    description,
    keywords,
    country,
    avatarUrl,
    bannerUrl,
    hasJoinButton,
    isVerified,
    isMadeForKids,
    channelId,
  };
}

export function extractVideoPageBasics(
  ytInitialData: YtNode,
  ytInitialPlayerResponse: YtNode,
  html = "",
): VideoPageBasics {
  let title: string | null = ytInitialPlayerResponse?.videoDetails?.title ?? null;
  let viewCount = Number(ytInitialPlayerResponse?.videoDetails?.viewCount) || 0;
  let durationSeconds = Number(ytInitialPlayerResponse?.videoDetails?.lengthSeconds) || 0;
  let channelId: string | null = ytInitialPlayerResponse?.videoDetails?.channelId ?? null;

  if (ytInitialData) {
    if (!title) {
      const m = /"title":\{"runs":\[\{"text":"([^"]+)/.exec(JSON.stringify(ytInitialData));
      if (m) title = m[1]!;
    }
    if (!viewCount) {
      const vt = findSimpleTextMatching(
        ytInitialData,
        (t) => /\bviews?\b/i.test(t) && /\d/.test(t),
        "longest",
      );
      viewCount = parseViewCountRaw(vt);
    }
    if (!durationSeconds) {
      const blob = JSON.stringify({ d: ytInitialData, p: ytInitialPlayerResponse });
      const md =
        /"lengthSeconds":"(\d{1,7})"/.exec(blob) ||
        /"lengthSeconds":(\d{1,7})\b/.exec(blob) ||
        /"approxDurationMs":"(\d{4,})"/.exec(blob);
      if (md) {
        durationSeconds = md[0].includes("approxDurationMs")
          ? Math.round(Number(md[1]) / 1000) || 0
          : Number(md[1]) || 0;
      }
    }
    if (!channelId) channelId = extractChannelSignals(ytInitialData, html).channelId;
  }

  if (!durationSeconds && html) {
    const mh = html.match(/"lengthSeconds":"(\d{1,7})"/);
    if (mh) durationSeconds = Number(mh[1]) || 0;
  }

  return { title, viewCount, durationSeconds, channelId };
}
