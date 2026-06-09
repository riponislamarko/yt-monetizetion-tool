import { z } from "zod";
import { signalSourceSchema, type SignalSource } from "./common.js";

export * from "./errors.js";
export * from "./common.js";
export * from "./tools.js";

/** A loosely-validated YouTube URL or identifier. Strict parsing happens in url-parser. */
export const youtubeUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required.")
  .max(2048, "URL is too long.");

/** Generic single-URL tool request body (most tools). */
export const urlRequestSchema = z.object({
  url: youtubeUrlSchema,
});
export type UrlRequest = z.infer<typeof urlRequestSchema>;

/** Money calculator also accepts manual inputs when no URL is provided. */
export const moneyCalculatorRequestSchema = z
  .object({
    url: youtubeUrlSchema.optional(),
    monthlyViews: z.number().int().nonnegative().optional(),
    niche: z
      .enum([
        "finance",
        "tech",
        "business",
        "health",
        "education",
        "lifestyle",
        "gaming",
        "entertainment",
        "comedy",
        "kids",
      ])
      .optional(),
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "Country must be a 2-letter ISO code.")
      .optional(),
  })
  .refine((v) => Boolean(v.url) || typeof v.monthlyViews === "number", {
    message: "Provide a YouTube URL or a monthlyViews figure.",
  });
export type MoneyCalculatorRequest = z.infer<typeof moneyCalculatorRequestSchema>;

/* ----------------------------- Response envelope ----------------------------- */

export function successEnvelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    cached: z.boolean(),
    signalSource: signalSourceSchema,
    processingTimeMs: z.number().nonnegative(),
  });
}

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number().int(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  cached: boolean;
  signalSource: SignalSource;
  processingTimeMs: number;
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;
