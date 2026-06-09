import { google, type youtube_v3 } from "googleapis";
import { YouTubeApiError } from "@yt/validators/errors";
import type { YoutubeQuotaManager } from "./quota-manager.js";

/**
 * YouTube Data API v3 ENRICHMENT client (§0, §5). Used ONLY where the Data API is
 * authoritative (clean structured metadata, handle/username resolution). It NEVER produces
 * an ad/monetization/shadowban signal — those come exclusively from InnerTube/scrape.
 *
 * Every method is a no-op-friendly wrapper: when no keys are configured the manager's
 * `isEnabled()` is false and callers must check `isEnabled()` and fall back to scraping.
 * Unit costs (§6.1): channels.list=1, videos.list=1, search.list=100.
 */

export interface DataApiChannel {
  id: string;
  title: string;
  description: string | null;
  customUrl: string | null;
  publishedAt: string | null;
  country: string | null;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  subscriberCount: number | null;
  hiddenSubscriberCount: boolean;
  videoCount: number | null;
  viewCount: number | null;
  keywords: string[];
  madeForKids: boolean | null;
  topicCategories: string[];
}

export interface DataApiVideo {
  id: string;
  title: string;
  description: string | null;
  channelId: string;
  channelTitle: string;
  publishedAt: string | null;
  tags: string[];
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  duration: string | null;
  madeForKids: boolean | null;
  topicCategories: string[];
  defaultLanguage: string | null;
}

function clientFor(apiKey: string): youtube_v3.Youtube {
  return google.youtube({ version: "v3", auth: apiKey });
}

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function topicLabels(urls: string[] | undefined): string[] {
  if (!Array.isArray(urls)) return [];
  return [...new Set(urls.map((u) => decodeURIComponent(u.split("/").pop() ?? "").replace(/_/g, " ")).filter(Boolean))];
}

function parseKeywords(raw: string | null | undefined): string[] {
  const input = String(raw ?? "").trim();
  if (!input) return [];
  const matches = input.match(/"([^"]+)"|'([^']+)'|[^\s,]+/g) ?? [];
  return matches.map((p) => p.replace(/^["']|["']$/g, "").trim()).filter(Boolean);
}

export class YoutubeDataApi {
  constructor(private readonly quota: YoutubeQuotaManager) {}

  isEnabled(): boolean {
    return this.quota.isEnabled();
  }

  private mapChannel(c: youtube_v3.Schema$Channel): DataApiChannel {
    const sn = c.snippet ?? {};
    const st = c.statistics ?? {};
    const branding = c.brandingSettings ?? {};
    const thumbs = sn.thumbnails ?? {};
    const thumbnailUrl = thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null;
    return {
      id: c.id ?? "",
      title: sn.title ?? "",
      description: sn.description ?? null,
      customUrl: sn.customUrl ?? null,
      publishedAt: sn.publishedAt ?? null,
      country: sn.country ?? branding.channel?.country ?? null,
      thumbnailUrl,
      bannerUrl: branding.image?.bannerExternalUrl ?? null,
      subscriberCount: num(st.subscriberCount),
      hiddenSubscriberCount: Boolean(st.hiddenSubscriberCount),
      videoCount: num(st.videoCount),
      viewCount: num(st.viewCount),
      keywords: parseKeywords(branding.channel?.keywords),
      madeForKids: c.status?.madeForKids ?? null,
      topicCategories: topicLabels(c.topicDetails?.topicCategories ?? undefined),
    };
  }

  private mapVideo(v: youtube_v3.Schema$Video): DataApiVideo {
    const sn = v.snippet ?? {};
    const st = v.statistics ?? {};
    return {
      id: v.id ?? "",
      title: sn.title ?? "",
      description: sn.description ?? null,
      channelId: sn.channelId ?? "",
      channelTitle: sn.channelTitle ?? "",
      publishedAt: sn.publishedAt ?? null,
      tags: Array.isArray(sn.tags) ? sn.tags : [],
      viewCount: num(st.viewCount),
      likeCount: num(st.likeCount),
      commentCount: num(st.commentCount),
      duration: v.contentDetails?.duration ?? null,
      madeForKids: v.status?.madeForKids ?? null,
      topicCategories: topicLabels(v.topicDetails?.topicCategories ?? undefined),
      defaultLanguage: sn.defaultLanguage ?? sn.defaultAudioLanguage ?? null,
    };
  }

  async getChannelById(channelId: string): Promise<DataApiChannel | null> {
    if (!this.isEnabled()) return null;
    return this.quota.execute(1, async (apiKey) => {
      try {
        const res = await clientFor(apiKey).channels.list({
          part: ["snippet", "statistics", "brandingSettings", "topicDetails", "status"],
          id: [channelId],
        });
        const item = res.data.items?.[0];
        return item ? this.mapChannel(item) : null;
      } catch (err) {
        throw new YouTubeApiError("channels.list failed.", err);
      }
    });
  }

  async getChannelByHandle(handle: string): Promise<DataApiChannel | null> {
    if (!this.isEnabled()) return null;
    const forHandle = handle.startsWith("@") ? handle : `@${handle}`;
    return this.quota.execute(1, async (apiKey) => {
      try {
        const res = await clientFor(apiKey).channels.list({
          part: ["snippet", "statistics", "brandingSettings", "topicDetails", "status"],
          forHandle,
        });
        const item = res.data.items?.[0];
        return item ? this.mapChannel(item) : null;
      } catch (err) {
        throw new YouTubeApiError("channels.list forHandle failed.", err);
      }
    });
  }

  async getChannelByUsername(username: string): Promise<DataApiChannel | null> {
    if (!this.isEnabled()) return null;
    return this.quota.execute(1, async (apiKey) => {
      try {
        const res = await clientFor(apiKey).channels.list({
          part: ["snippet", "statistics", "brandingSettings", "topicDetails", "status"],
          forUsername: username,
        });
        const item = res.data.items?.[0];
        return item ? this.mapChannel(item) : null;
      } catch (err) {
        throw new YouTubeApiError("channels.list forUsername failed.", err);
      }
    });
  }

  async getVideoById(videoId: string): Promise<DataApiVideo | null> {
    if (!this.isEnabled()) return null;
    return this.quota.execute(1, async (apiKey) => {
      try {
        const res = await clientFor(apiKey).videos.list({
          part: ["snippet", "statistics", "contentDetails", "status", "topicDetails"],
          id: [videoId],
        });
        const item = res.data.items?.[0];
        return item ? this.mapVideo(item) : null;
      } catch (err) {
        throw new YouTubeApiError("videos.list failed.", err);
      }
    });
  }

  /**
   * search.list — EXPENSIVE (100 units). Used only by the shadowban detector and gated by
   * the caller. Returns whether the channel appears in search results for the query.
   */
  async searchChannelVisibility(query: string, channelId: string): Promise<boolean> {
    return this.quota.execute(100, async (apiKey) => {
      try {
        const res = await clientFor(apiKey).search.list({
          part: ["snippet"],
          q: query,
          type: ["channel"],
          maxResults: 25,
        });
        return (res.data.items ?? []).some((i) => i.snippet?.channelId === channelId || i.id?.channelId === channelId);
      } catch (err) {
        throw new YouTubeApiError("search.list failed.", err);
      }
    });
  }
}
