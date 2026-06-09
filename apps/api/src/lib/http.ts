/**
 * Small HTTP helpers shared by the image/thumbnail tools. HEAD-check probes image URLs for
 * real availability (YouTube's maxresdefault is often missing) with a concurrency cap and a
 * timeout, capturing Content-Length when the server provides it.
 */

export interface HeadResult {
  url: string;
  available: boolean;
  fileSize: number | null;
}

const HEAD_TIMEOUT_MS = 5000;

export async function headCheck(url: string): Promise<HeadResult> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    const len = res.headers.get("content-length");
    return {
      url,
      available: res.ok,
      fileSize: len ? Number(len) || null : null,
    };
  } catch {
    return { url, available: false, fileSize: null };
  } finally {
    clearTimeout(t);
  }
}

/** Run async tasks with a bounded concurrency, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function headCheckAll(urls: string[], concurrency = 6): Promise<HeadResult[]> {
  return mapWithConcurrency(urls, concurrency, (u) => headCheck(u));
}
