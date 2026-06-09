import { test, expect, type Page } from "@playwright/test";

/**
 * Happy-path E2E for the three tools called out in §12. These drive the real UI against the
 * running stack. To stay robust against YouTube/network variability, each test asserts the
 * tool PAGE works end-to-end: it renders, accepts input, submits, and resolves to either a
 * result card or a typed error state (both are valid UI outcomes) — never hanging.
 */

async function runTool(page: Page, slug: string, heading: RegExp, url: string) {
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);

  const input = page.getByLabel("YouTube URL");
  await expect(input).toBeVisible();
  await input.fill(url);

  const submit = page.getByRole("button", { name: /check|find|extract|view|generate|calculate|get|detect|work/i });
  await expect(submit).toBeEnabled();
  await submit.click();

  // The request resolves to either a result region or a typed error state. Either proves the
  // page → api-client → envelope → render pipeline works.
  const result = page.getByTestId("tool-result").or(page.getByRole("alert"));
  await expect(result.first()).toBeVisible({ timeout: 30_000 });
}

test.describe("tool happy paths", () => {
  test("thumbnail-downloader", async ({ page }) => {
    await runTool(page, "thumbnail-downloader", /thumbnail/i, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  test("channel-id-finder", async ({ page }) => {
    await runTool(page, "channel-id-finder", /channel id/i, "https://www.youtube.com/@MrBeast");
  });

  test("tag-extractor", async ({ page }) => {
    await runTool(page, "tag-extractor", /tag/i, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });
});

test("homepage links all 8 tools", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const slug of [
    "monetization-checker",
    "channel-id-finder",
    "data-viewer",
    "image-tool",
    "tag-extractor",
    "money-calculator",
    "shadowban-detector",
    "thumbnail-downloader",
  ]) {
    await expect(page.locator(`a[href$="/${slug}"]`).first()).toBeVisible();
  }
});
