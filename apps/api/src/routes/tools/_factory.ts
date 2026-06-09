import type { FastifyInstance } from "fastify";
import type { z } from "zod";
import { successEnvelopeSchema, errorEnvelopeSchema, type SignalSource } from "@yt/validators";
import { toolLookups } from "@yt/db";
import type { AppContext } from "../../context.js";
import { cacheKey } from "../../lib/cache.js";
import { hashIp } from "../../lib/ip.js";

export interface ServiceOutput<T> {
  data: T;
  signalSource: SignalSource;
}

export interface ToolRouteConfig<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny> {
  toolName: string;
  path: string;
  summary: string;
  requestSchema: Req;
  responseSchema: Res;
  ttlSeconds: number;
  /** Derive the string used for the cache key + tool_lookups.input_url from the request. */
  cacheKeyInput: (body: z.infer<Req>) => string;
  handler: (body: z.infer<Req>, ctx: AppContext) => Promise<ServiceOutput<z.infer<Res>>>;
}

/**
 * Registers one tool route with the shared contract (§8): Zod validation (drives OpenAPI),
 * per-IP rate limiting (applied globally by the plugin), cache.getOrSet, fire-and-forget
 * tool_lookups persistence, the response envelope, and timing. Typed errors thrown by the
 * service are mapped by the global error handler (§9).
 */
export function registerToolRoute<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(
  app: FastifyInstance,
  ctx: AppContext,
  config: ToolRouteConfig<Req, Res>,
): void {
  // Global validator/serializer compilers (set in app.ts) make the Zod schemas drive both
  // runtime validation and the OpenAPI spec. We don't use the provider's handler-return
  // inference (it produces a union across all declared status codes that fights a generic
  // factory) — req.body is cast explicitly below instead.
  app.route({
    method: "POST",
    url: config.path,
    schema: {
      summary: config.summary,
      tags: ["tools"],
      body: config.requestSchema,
      response: {
        200: successEnvelopeSchema(config.responseSchema),
        400: errorEnvelopeSchema,
        404: errorEnvelopeSchema,
        429: errorEnvelopeSchema,
        502: errorEnvelopeSchema,
        500: errorEnvelopeSchema,
      },
    },
    handler: async (req, reply) => {
      const started = Date.now();
      const body = req.body as z.infer<Req>;
      const input = config.cacheKeyInput(body);
      const key = cacheKey(config.toolName, input);

      const { value, cached } = await ctx.cache.getOrSet<ServiceOutput<z.infer<Res>>>(
        key,
        config.ttlSeconds,
        () => config.handler(body, ctx),
      );

      const processingTimeMs = Date.now() - started;

      // Fire-and-forget audit log; a DB failure must never fail the request (§8).
      const ipHash = hashIp(req.ip, ctx.env.IP_HASH_SALT);
      void ctx.db
        .insert(toolLookups)
        .values({
          toolName: config.toolName,
          inputUrl: input,
          result: value.data as unknown as object,
          cached,
          signalSource: value.signalSource,
          ipHash,
        })
        .catch((err) => ctx.log.debug({ err: (err as Error)?.message }, "tool_lookups insert failed"));

      ctx.log.info(
        {
          tool_name: config.toolName,
          cached,
          signalSource: value.signalSource,
          processingTimeMs,
          outcome: "ok",
        },
        "tool request",
      );

      reply.code(200);
      return {
        success: true as const,
        data: value.data,
        cached,
        signalSource: value.signalSource,
        processingTimeMs,
      };
    },
  });
}
