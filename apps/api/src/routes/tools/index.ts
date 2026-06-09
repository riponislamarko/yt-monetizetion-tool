import type { FastifyInstance } from "fastify";
import {
  urlRequestSchema,
  moneyCalculatorRequestSchema,
  monetizationResultSchema,
  channelIdResultSchema,
  dataViewerResultSchema,
  imageToolResultSchema,
  tagExtractorResultSchema,
  moneyCalculatorResultSchema,
  shadowbanResultSchema,
  thumbnailResultSchema,
} from "@yt/validators";
import type { AppContext } from "../../context.js";
import { TTL_BY_TOOL } from "../../lib/cache.js";
import { registerToolRoute } from "./_factory.js";
import { runMonetizationChecker } from "../../services/monetization-checker.js";
import { runChannelIdFinder } from "../../services/channel-id-finder.js";
import { runDataViewer } from "../../services/data-viewer.js";
import { runImageTool } from "../../services/image-tool.js";
import { runTagExtractor } from "../../services/tag-extractor.js";
import { runMoneyCalculator } from "../../services/money-calculator.js";
import { runShadowbanDetector } from "../../services/shadowban-detector.js";
import { runThumbnailDownloader } from "../../services/thumbnail-downloader.js";

/** Register all 8 tool routes under /api/tools (§8). */
export function registerToolRoutes(app: FastifyInstance, ctx: AppContext): void {
  const urlKey = (b: { url: string }) => b.url;

  registerToolRoute(app, ctx, {
    toolName: "monetization-checker",
    path: "/api/tools/monetization-checker",
    summary: "Estimate monetization status from InnerTube ad signals + channel scrape.",
    requestSchema: urlRequestSchema,
    responseSchema: monetizationResultSchema,
    ttlSeconds: TTL_BY_TOOL["monetization-checker"]!,
    cacheKeyInput: urlKey,
    handler: runMonetizationChecker,
  });

  registerToolRoute(app, ctx, {
    toolName: "channel-id-finder",
    path: "/api/tools/channel-id-finder",
    summary: "Resolve any YouTube URL to its canonical channel ID and metadata.",
    requestSchema: urlRequestSchema,
    responseSchema: channelIdResultSchema,
    ttlSeconds: TTL_BY_TOOL["channel-id-finder"]!,
    cacheKeyInput: urlKey,
    handler: runChannelIdFinder,
  });

  registerToolRoute(app, ctx, {
    toolName: "data-viewer",
    path: "/api/tools/data-viewer",
    summary: "Rich video/channel metadata with derived metrics.",
    requestSchema: urlRequestSchema,
    responseSchema: dataViewerResultSchema,
    ttlSeconds: TTL_BY_TOOL["data-viewer"]!,
    cacheKeyInput: urlKey,
    handler: runDataViewer,
  });

  registerToolRoute(app, ctx, {
    toolName: "image-tool",
    path: "/api/tools/image-tool",
    summary: "Channel avatar/banner and video thumbnail URLs (availability-probed).",
    requestSchema: urlRequestSchema,
    responseSchema: imageToolResultSchema,
    ttlSeconds: TTL_BY_TOOL["image-tool"]!,
    cacheKeyInput: urlKey,
    handler: runImageTool,
  });

  registerToolRoute(app, ctx, {
    toolName: "tag-extractor",
    path: "/api/tools/tag-extractor",
    summary: "Extract video tags or channel keywords.",
    requestSchema: urlRequestSchema,
    responseSchema: tagExtractorResultSchema,
    ttlSeconds: TTL_BY_TOOL["tag-extractor"]!,
    cacheKeyInput: urlKey,
    handler: runTagExtractor,
  });

  registerToolRoute(app, ctx, {
    toolName: "money-calculator",
    path: "/api/tools/money-calculator",
    summary: "Estimate earnings from a URL or manual views/niche/country.",
    requestSchema: moneyCalculatorRequestSchema,
    responseSchema: moneyCalculatorResultSchema,
    ttlSeconds: TTL_BY_TOOL["money-calculator"]!,
    cacheKeyInput: (b) => b.url ?? `manual:${b.monthlyViews}:${b.niche ?? ""}:${b.country ?? ""}`,
    handler: runMoneyCalculator,
  });

  registerToolRoute(app, ctx, {
    toolName: "shadowban-detector",
    path: "/api/tools/shadowban-detector",
    summary: "Detect search-suppression signals (cheap scrape + gated search.list).",
    requestSchema: urlRequestSchema,
    responseSchema: shadowbanResultSchema,
    ttlSeconds: TTL_BY_TOOL["shadowban-detector"]!,
    cacheKeyInput: urlKey,
    handler: runShadowbanDetector,
  });

  registerToolRoute(app, ctx, {
    toolName: "thumbnail-downloader",
    path: "/api/tools/thumbnail-downloader",
    summary: "Direct img.youtube.com thumbnail links at every quality.",
    requestSchema: urlRequestSchema,
    responseSchema: thumbnailResultSchema,
    ttlSeconds: TTL_BY_TOOL["thumbnail-downloader"]!,
    cacheKeyInput: urlKey,
    handler: runThumbnailDownloader,
  });
}
