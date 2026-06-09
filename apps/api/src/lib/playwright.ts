import type { Browser, BrowserContext } from "playwright-core";
import type { Logger } from "pino";

/**
 * Headless-Chromium fallback pool (§7). Used ONLY when InnerTube + cheerio cannot extract a
 * required signal from a heavily client-rendered surface. NOT the default path — most tools
 * never touch it. Singleton browser, max-concurrency semaphore (default 2), idle-close.
 *
 * Chromium CANNOT run on Vercel/Lambda — this is why apps/api deploys as a container (§7).
 * playwright-core is imported lazily so the API still boots where browsers aren't installed;
 * a failed launch degrades to "fallback unavailable" rather than crashing.
 */

const IDLE_CLOSE_MS = 60_000;

export class PlaywrightPool {
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private active = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly log: Logger,
    private readonly maxConcurrency = 2,
  ) {}

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      const { chromium } = await import("playwright-core");
      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
      this.browser = browser;
      this.log.info("Playwright browser launched (fallback pool)");
      return browser;
    })();
    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  private acquireSlot(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.active--;
    const next = this.waiters.shift();
    if (next) next();
    this.scheduleIdleClose();
  }

  private scheduleIdleClose(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.active === 0) void this.close();
    }, IDLE_CLOSE_MS);
  }

  /**
   * Run `fn` against a fresh, isolated browser context. Returns null (and logs) if the
   * browser cannot be launched — callers treat that as "fallback unavailable".
   */
  async withContext<T>(fn: (ctx: BrowserContext) => Promise<T>): Promise<T | null> {
    await this.acquireSlot();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    let context: BrowserContext | null = null;
    try {
      const browser = await this.getBrowser();
      context = await browser.newContext({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        locale: "en-US",
      });
      return await fn(context);
    } catch (err) {
      this.log.warn({ err: (err as Error)?.message }, "Playwright fallback failed/unavailable");
      return null;
    } finally {
      if (context) await context.close().catch(() => undefined);
      this.releaseSlot();
    }
  }

  async close(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    const b = this.browser;
    this.browser = null;
    if (b) await b.close().catch(() => undefined);
  }
}
