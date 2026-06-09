/**
 * Typed application errors. Each carries a stable machine-readable `code` and an HTTP
 * `statusCode`. The Fastify error handler maps these to the response envelope (§9).
 *
 * CacheError is intentionally internal — it is logged and swallowed by the cache layer
 * and must never reach the client (cache is a non-fatal optimization).
 */

export type AppErrorCode =
  | "INVALID_URL"
  | "CHANNEL_NOT_FOUND"
  | "VIDEO_NOT_FOUND"
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "SCRAPING_FAILED"
  | "YOUTUBE_API_ERROR"
  | "CACHE_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  /** Optional cause for server-side logging; never serialized to the client. */
  readonly detail?: unknown;

  constructor(code: AppErrorCode, statusCode: number, message: string, detail?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.detail = detail;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class InvalidUrlError extends AppError {
  constructor(message = "Input is not a valid YouTube URL.", detail?: unknown) {
    super("INVALID_URL", 400, message, detail);
  }
}

export class ChannelNotFoundError extends AppError {
  constructor(message = "Channel does not exist or has been deleted.", detail?: unknown) {
    super("CHANNEL_NOT_FOUND", 404, message, detail);
  }
}

export class VideoNotFoundError extends AppError {
  constructor(message = "Video does not exist, is private, or has been deleted.", detail?: unknown) {
    super("VIDEO_NOT_FOUND", 404, message, detail);
  }
}

export class QuotaExhaustedError extends AppError {
  constructor(message = "All YouTube Data API keys have hit their daily limit.", detail?: unknown) {
    super("QUOTA_EXHAUSTED", 429, message, detail);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Rate limit exceeded. Please slow down and try again shortly.", detail?: unknown) {
    super("RATE_LIMITED", 429, message, detail);
  }
}

export class ScrapingError extends AppError {
  constructor(message = "Failed to retrieve data from YouTube.", detail?: unknown) {
    super("SCRAPING_FAILED", 502, message, detail);
  }
}

export class YouTubeApiError extends AppError {
  constructor(message = "YouTube API returned an unexpected error.", detail?: unknown) {
    super("YOUTUBE_API_ERROR", 502, message, detail);
  }
}

/** Internal-only. Logged and swallowed by the cache layer; never returned to clients. */
export class CacheError extends AppError {
  constructor(message = "Cache operation failed.", detail?: unknown) {
    super("CACHE_ERROR", 500, message, detail);
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
