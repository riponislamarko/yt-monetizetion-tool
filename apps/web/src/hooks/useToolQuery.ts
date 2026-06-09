"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import { callTool, type ApiError, type ToolResponse } from "@/lib/api-client";

/**
 * A tool invocation is a user-triggered action (submit), so we model it as a mutation
 * rather than a query — this avoids auto-refetch surprises and gives explicit `mutate`.
 * The result still carries the full envelope metadata (cached / signalSource / timing).
 */
export function useToolQuery<TResult>(
  apiName: string,
): UseMutationResult<ToolResponse<TResult>, ApiError, Record<string, unknown>> {
  return useMutation<ToolResponse<TResult>, ApiError, Record<string, unknown>>({
    mutationKey: ["tool", apiName],
    mutationFn: (body) => callTool<TResult>(apiName, body),
  });
}
