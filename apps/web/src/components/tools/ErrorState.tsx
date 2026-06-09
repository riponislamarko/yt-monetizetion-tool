"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { ApiError, type ApiErrorCode } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorCopy {
  title: string;
  message: string;
  retryable: boolean;
}

/** A distinct, actionable message per error code (quality bar §10). */
function copyForError(error: unknown): ErrorCopy {
  const code: ApiErrorCode | "UNKNOWN" =
    error instanceof ApiError ? error.code : "UNKNOWN";
  const serverMessage = error instanceof ApiError ? error.message : undefined;

  switch (code) {
    case "INVALID_URL":
      return {
        title: "That doesn't look like a valid YouTube URL",
        message:
          serverMessage ??
          "Double-check the link. Paste a channel URL, @handle, or video URL.",
        retryable: false,
      };
    case "CHANNEL_NOT_FOUND":
      return {
        title: "Channel not found",
        message:
          serverMessage ??
          "We couldn't find a channel for that link. It may be deleted, private, or mistyped.",
        retryable: false,
      };
    case "VIDEO_NOT_FOUND":
      return {
        title: "Video not found",
        message:
          serverMessage ??
          "We couldn't find that video. It may be private, removed, or the URL is wrong.",
        retryable: false,
      };
    case "QUOTA_EXHAUSTED":
      return {
        title: "Daily data quota reached",
        message:
          "The enrichment data quota is used up for today. Core results still work — try again later for full detail.",
        retryable: true,
      };
    case "RATE_LIMITED":
      return {
        title: "Too many requests",
        message:
          serverMessage ?? "You're going a little fast. Wait a moment and try again.",
        retryable: true,
      };
    case "SCRAPING_FAILED":
      return {
        title: "Couldn't read that page",
        message:
          "YouTube didn't return the data we needed. This is usually temporary — please retry.",
        retryable: true,
      };
    case "YOUTUBE_API_ERROR":
      return {
        title: "Upstream YouTube error",
        message: "YouTube returned an error. This is usually temporary — please retry.",
        retryable: true,
      };
    case "NETWORK_ERROR":
      return {
        title: "Can't reach the server",
        message: "Check your internet connection and try again.",
        retryable: true,
      };
    default:
      return {
        title: "Something went wrong",
        message:
          serverMessage ?? "An unexpected error occurred. Please try again in a moment.",
        retryable: true,
      };
  }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, message, retryable } = copyForError(error);

  return (
    <Card className="border-destructive/40" role="alert">
      <CardContent className="flex flex-col items-start gap-3 py-6 sm:flex-row sm:items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
        {retryable && onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
