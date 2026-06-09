import type { ApiEnvelope, SignalSource } from "@yt/validators";

/**
 * Stable error codes the API can return (mirrors apps/api error contract). ErrorState
 * renders a distinct, actionable message per code.
 */
export type ApiErrorCode =
  | "INVALID_URL"
  | "CHANNEL_NOT_FOUND"
  | "VIDEO_NOT_FOUND"
  | "QUOTA_EXHAUSTED"
  | "RATE_LIMITED"
  | "SCRAPING_FAILED"
  | "YOUTUBE_API_ERROR"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

/** Typed error thrown by the api-client. Carries the stable `code` for UI branching. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Successful tool response, unwrapped but keeping the envelope metadata for the UI. */
export interface ToolResponse<T> {
  data: T;
  cached: boolean;
  signalSource: SignalSource;
  processingTimeMs: number;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const KNOWN_CODES: ReadonlySet<string> = new Set([
  "INVALID_URL",
  "CHANNEL_NOT_FOUND",
  "VIDEO_NOT_FOUND",
  "QUOTA_EXHAUSTED",
  "RATE_LIMITED",
  "SCRAPING_FAILED",
  "YOUTUBE_API_ERROR",
  "INTERNAL_ERROR",
]);

function normalizeCode(code: string): ApiErrorCode {
  return (KNOWN_CODES.has(code) ? code : "INTERNAL_ERROR") as ApiErrorCode;
}

/**
 * POST a tool request and unwrap the response envelope. Throws a typed {@link ApiError}
 * on any failure (network, non-2xx, or `success:false` body).
 */
export async function callTool<T>(
  toolName: string,
  body: Record<string, unknown>,
): Promise<ToolResponse<T>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/tools/${toolName}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
      0,
    );
  }

  let json: ApiEnvelope<T> | undefined;
  try {
    json = (await res.json()) as ApiEnvelope<T>;
  } catch {
    json = undefined;
  }

  if (json && json.success === false) {
    throw new ApiError(
      normalizeCode(json.error.code),
      json.error.message,
      json.error.statusCode,
    );
  }

  if (!res.ok || !json || json.success !== true) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The server returned an unexpected response. Please try again.",
      res.status || 500,
    );
  }

  return {
    data: json.data,
    cached: json.cached,
    signalSource: json.signalSource,
    processingTimeMs: json.processingTimeMs,
  };
}
