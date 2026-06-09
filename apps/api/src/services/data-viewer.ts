import type { DataViewerResult, UrlRequest } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { fetchChannelBundle, fetchVideoBundle, resolveChannelId } from "./shared.js";

function ratio(n: number | null | undefined, d: number | null | undefined): number | null {
  if (!n || !d) return null;
  return Math.round((n / d) * 1e6) / 1e6;
}

function ageInDays(createdAt: string | null): number | null {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / (1000 * 60 * 60 * 24)));
}

export async function runDataViewer(
  body: UrlRequest,
  ctx: AppContext,
): Promise<ServiceOutput<DataViewerResult>> {
  const parsed = parseUrl(body.url);

  if (parsed.type === "video") {
    const v = await fetchVideoBundle(parsed.id!, ctx);
    const views = v.viewCount;
    const likes = v.dataApi?.likeCount ?? null;
    const comments = v.dataApi?.commentCount ?? null;
    const data: DataViewerResult = {
      type: "video",
      channel: null,
      video: {
        videoId: v.videoId,
        title: v.title,
        description: v.dataApi?.description ?? null,
        channelId: v.channelId,
        channelTitle: v.ownerName,
        publishedAt: v.dataApi?.publishedAt ?? null,
        durationSeconds: v.durationSeconds,
        viewCount: views,
        likeCount: likes,
        commentCount: comments,
        tags: v.dataApi?.tags ?? [],
        topicCategories: v.dataApi?.topicCategories ?? [],
        madeForKids: v.dataApi?.madeForKids ?? null,
        defaultLanguage: v.dataApi?.defaultLanguage ?? null,
      },
      derivedMetrics: {
        engagementRate: views ? ratio((likes ?? 0) + (comments ?? 0), views) : null,
        estimatedUploadFrequency: null,
        averageViewsPerVideo: null,
        likeToViewRatio: ratio(likes, views),
        commentToViewRatio: ratio(comments, views),
        channelAgeInDays: null,
        subscribersPerDay: null,
      },
    };
    return { data, signalSource: v.source };
  }

  const channelId = await resolveChannelId(parsed, ctx);
  const c = await fetchChannelBundle(channelId, ctx);
  const created = c.dataApi?.publishedAt ?? null;
  const age = ageInDays(created);
  const subs = c.subscriberCount;
  const totalViews = c.dataApi?.viewCount ?? null;
  const videoCount = c.videoCount;

  const data: DataViewerResult = {
    type: "channel",
    video: null,
    channel: {
      channelId: c.channelId,
      title: c.signals.channelName ?? c.dataApi?.title ?? null,
      description: c.signals.description ?? c.dataApi?.description ?? null,
      customUrl: c.dataApi?.customUrl ?? null,
      country: c.dataApi?.country ?? c.signals.country ?? null,
      publishedAt: created,
      thumbnailUrl: c.signals.avatarUrl ?? c.dataApi?.thumbnailUrl ?? null,
      bannerUrl: c.signals.bannerUrl ?? c.dataApi?.bannerUrl ?? null,
      subscriberCount: subs,
      videoCount,
      viewCount: totalViews,
      keywords: c.signals.keywords.length ? c.signals.keywords : (c.dataApi?.keywords ?? []),
      topicCategories: c.topics,
      isVerified: c.signals.isVerified,
      madeForKids: c.dataApi?.madeForKids ?? (c.isFamilySafe != null ? !c.isFamilySafe : null),
    },
    derivedMetrics: {
      engagementRate: null,
      estimatedUploadFrequency: age && videoCount ? Math.round((videoCount / (age / 7)) * 100) / 100 : null,
      averageViewsPerVideo: totalViews && videoCount ? Math.round(totalViews / videoCount) : null,
      likeToViewRatio: null,
      commentToViewRatio: null,
      channelAgeInDays: age,
      subscribersPerDay: subs && age ? Math.round((subs / age) * 100) / 100 : null,
    },
  };
  return { data, signalSource: c.source };
}
