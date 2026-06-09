import { createContext, destroyContext } from "./context.js";
import { buildApp } from "./app.js";

/**
 * Bootstrap (§9, §6.5): env validation (inside createContext) → plugins → routes → listen.
 * Graceful shutdown on SIGTERM/SIGINT: close Fastify (drains in-flight), drain the Playwright
 * pool, end the PG pool, quit Redis.
 */
async function main(): Promise<void> {
  const ctx = createContext();
  const app = await buildApp(ctx);

  // Connect Redis eagerly so /readyz reflects reality, but don't fail boot if it's down.
  ctx.redis.connect().catch(() => ctx.log.warn("Redis not reachable at boot — cache degraded."));

  await app.listen({ host: "0.0.0.0", port: ctx.env.PORT });
  ctx.log.info({ port: ctx.env.PORT }, "API listening");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    ctx.log.info({ signal }, "Shutting down…");
    try {
      await app.close();
      await destroyContext(ctx);
      ctx.log.info("Shutdown complete.");
      process.exit(0);
    } catch (err) {
      ctx.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal boot error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
