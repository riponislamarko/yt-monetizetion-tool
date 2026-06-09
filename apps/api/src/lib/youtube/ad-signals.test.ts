import { describe, it, expect } from "vitest";
import { extractAdSignals, extractFirstVideoId } from "./scrape.js";

/** A monetized video reserves an ad slot via clientForecastingAdRenderer (empirically verified). */
const monetizedPlayerResponse = {
  playabilityStatus: { status: "OK" },
  adPlacements: [
    {
      adPlacementRenderer: {
        config: { adPlacementConfig: { kind: "AD_PLACEMENT_KIND_START" } },
        renderer: { clientForecastingAdRenderer: {} },
      },
    },
  ],
};

const realInstreamAd = {
  playabilityStatus: { status: "OK" },
  adPlacements: [
    { adPlacementRenderer: { renderer: { instreamVideoAdRenderer: {} } } },
  ],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
};

const notMonetized = { playabilityStatus: { status: "OK" }, adPlacements: [] };

describe("extractAdSignals", () => {
  it("flags a monetized video (forecasting ad slot reserved)", () => {
    const s = extractAdSignals(monetizedPlayerResponse);
    expect(s.available).toBe(true);
    expect(s.adsEnabled).toBe(true);
    expect(s.hasForecastingAd).toBe(true);
    expect(s.adPlacementCount).toBe(1);
    expect(s.adRendererTypes).toContain("clientForecastingAdRenderer");
  });

  it("flags a video with a real instream ad", () => {
    const s = extractAdSignals(realInstreamAd);
    expect(s.adsEnabled).toBe(true);
    expect(s.hasInstreamAd).toBe(true);
    expect(s.playerAdsEnabled).toBe(true);
  });

  it("reports NOT monetized when adPlacements is empty", () => {
    const s = extractAdSignals(notMonetized);
    expect(s.available).toBe(true);
    expect(s.adsEnabled).toBe(false);
    expect(s.adPlacementCount).toBe(0);
  });

  it("reports unavailable (not a false negative) when there is no player response", () => {
    const s = extractAdSignals(null);
    expect(s.available).toBe(false);
    expect(s.adsEnabled).toBe(false);
  });
});

describe("extractFirstVideoId", () => {
  it("pulls the first 11-char videoId from channel HTML", () => {
    expect(extractFirstVideoId('...,"videoId":"GpQSUjNsNm0","x":1')).toBe("GpQSUjNsNm0");
  });
  it("returns null when none present", () => {
    expect(extractFirstVideoId("no ids here")).toBeNull();
  });
});
