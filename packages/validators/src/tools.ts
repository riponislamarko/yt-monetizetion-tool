import { z } from "zod";
import { signalSourceSchema } from "./common.js";

/**
 * Per-tool request + response Zod schemas (CLAUDE.md §8). These are the SINGLE SOURCE OF
 * TRUTH: the API derives OpenAPI from them via fastify-type-provider-zod and the web app
 * imports the inferred types. Anything a data layer cannot reliably produce is `.nullable()`
 * — never fabricated (a Phase-1 quality gate).
 */

const range = z.object({ min: z.number(), max: z.number() });
const rangeAvg = z.object({ min: z.number(), avg: z.number(), max: z.number() });

/* ----------------------------- Tool 1: Monetization Checker ----------------------------- */

export const monetizationStatusSchema = z.enum([
  "monetized",
  "likely_monetized",
  "unlikely",
  "not_monetized",
]);

export const monetizationResultSchema = z.object({
  type: z.enum(["channel", "video"]),
  channelId: z.string().nullable(),
  channelTitle: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  videoCount: z.number().nullable(),
  viewCount: z.number().nullable(),
  isMonetized: z.boolean(),
  monetizationScore: z.number(),
  monetizationStatus: monetizationStatusSchema,
  confidence: z.number(),
  hasAds: z.boolean(),
  adTypes: z.array(z.string()),
  adBreakCount: z.number(),
  adBreakOffsets: z.array(z.number()),
  isAuthentic: z.boolean(),
  isMadeForKids: z.boolean().nullable(),
  hasJoinButton: z.boolean(),
  channelCountry: z.string().nullable(),
  topicCategories: z.array(z.string()),
  estimatedMonthlyEarnings: range.nullable(),
  estimatedYearlyEarnings: range.nullable(),
  channelCreatedAt: z.string().nullable(),
  defaultLanguage: z.string().nullable(),
  tags: z.array(z.string()),
  reasons: z.array(z.string()),
  signalSources: z.record(signalSourceSchema),
});
export type MonetizationResult = z.infer<typeof monetizationResultSchema>;

/* ----------------------------- Tool 2: Channel ID Finder ----------------------------- */

export const channelIdResultSchema = z.object({
  channelId: z.string(),
  channelUrl: z.string(),
  handle: z.string().nullable(),
  customUrl: z.string().nullable(),
  userId: z.string().nullable(),
  channelTitle: z.string().nullable(),
  description: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  videoCount: z.number().nullable(),
  viewCount: z.number().nullable(),
  country: z.string().nullable(),
  createdAt: z.string().nullable(),
  isVerified: z.boolean(),
});
export type ChannelIdResult = z.infer<typeof channelIdResultSchema>;

/* ----------------------------- Tool 3: Data Viewer ----------------------------- */

export const derivedMetricsSchema = z.object({
  engagementRate: z.number().nullable(),
  estimatedUploadFrequency: z.number().nullable(),
  averageViewsPerVideo: z.number().nullable(),
  likeToViewRatio: z.number().nullable(),
  commentToViewRatio: z.number().nullable(),
  channelAgeInDays: z.number().nullable(),
  subscribersPerDay: z.number().nullable(),
});

export const dataViewerChannelSchema = z.object({
  channelId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  customUrl: z.string().nullable(),
  country: z.string().nullable(),
  publishedAt: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  videoCount: z.number().nullable(),
  viewCount: z.number().nullable(),
  keywords: z.array(z.string()),
  topicCategories: z.array(z.string()),
  isVerified: z.boolean(),
  madeForKids: z.boolean().nullable(),
});

export const dataViewerVideoSchema = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  channelId: z.string().nullable(),
  channelTitle: z.string().nullable(),
  publishedAt: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  viewCount: z.number().nullable(),
  likeCount: z.number().nullable(),
  commentCount: z.number().nullable(),
  tags: z.array(z.string()),
  topicCategories: z.array(z.string()),
  madeForKids: z.boolean().nullable(),
  defaultLanguage: z.string().nullable(),
});

export const dataViewerResultSchema = z.object({
  type: z.enum(["video", "channel"]),
  channel: dataViewerChannelSchema.nullable(),
  video: dataViewerVideoSchema.nullable(),
  derivedMetrics: derivedMetricsSchema,
});
export type DataViewerResult = z.infer<typeof dataViewerResultSchema>;

/* ----------------------------- Tool 4: Image Tool ----------------------------- */

const imageEntrySchema = z.object({
  label: z.string(),
  url: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  available: z.boolean(),
});

export const imageToolResultSchema = z.object({
  type: z.enum(["channel", "video"]),
  channelTitle: z.string().nullable(),
  videoTitle: z.string().nullable(),
  thumbnails: z.array(imageEntrySchema),
  profilePictures: z.array(imageEntrySchema),
  bannerImages: z.array(imageEntrySchema),
});
export type ImageToolResult = z.infer<typeof imageToolResultSchema>;

/* ----------------------------- Tool 5: Tag Extractor ----------------------------- */

export const tagExtractorResultSchema = z.object({
  type: z.enum(["video", "channel"]),
  title: z.string().nullable(),
  tags: z.array(z.string()),
  tagCount: z.number(),
  totalCharacters: z.number(),
  remainingCharacters: z.number().nullable(),
  copyableString: z.string(),
});
export type TagExtractorResult = z.infer<typeof tagExtractorResultSchema>;

/* ----------------------------- Tool 6: Money Calculator ----------------------------- */

export const moneyCalculatorResultSchema = z.object({
  channelTitle: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  totalViews: z.number().nullable(),
  monthlyViews: z.number(),
  estimatedCountry: z.string().nullable(),
  detectedNiche: z.string().nullable(),
  cpmRange: rangeAvg,
  rpmRange: rangeAvg,
  earnings: z.object({
    perVideo: rangeAvg,
    monthly: rangeAvg,
    yearly: rangeAvg,
  }),
  disclaimer: z.string(),
});
export type MoneyCalculatorResult = z.infer<typeof moneyCalculatorResultSchema>;

/* ----------------------------- Tool 7: Shadowban Detector ----------------------------- */

const shadowbanCheckSchema = z.object({
  passed: z.boolean().nullable(),
  details: z.string(),
});

export const shadowbanResultSchema = z.object({
  channelId: z.string(),
  channelTitle: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  subscriberCount: z.number().nullable(),
  isShadowbanned: z.boolean(),
  shadowbanScore: z.number(),
  shadowbanStatus: z.enum(["clean", "partial", "likely", "shadowbanned"]),
  checks: z.object({
    searchVisibility: shadowbanCheckSchema,
    channelPublicStatus: shadowbanCheckSchema,
    subscriberVisibility: shadowbanCheckSchema,
    madeForKids: shadowbanCheckSchema,
    searchIndexed: shadowbanCheckSchema,
  }),
  recommendations: z.array(z.string()),
});
export type ShadowbanResult = z.infer<typeof shadowbanResultSchema>;

/* ----------------------------- Tool 8: Thumbnail Downloader ----------------------------- */

const thumbnailEntrySchema = z.object({
  quality: z.string(),
  label: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
  available: z.boolean(),
  fileSize: z.number().nullable(),
});

export const thumbnailResultSchema = z.object({
  videoId: z.string(),
  videoTitle: z.string().nullable(),
  channelTitle: z.string().nullable(),
  channelId: z.string().nullable(),
  thumbnails: z.array(thumbnailEntrySchema),
});
export type ThumbnailResult = z.infer<typeof thumbnailResultSchema>;
