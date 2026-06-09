import { describe, it, expect } from "vitest";
import { estimateEarnings, cpmTierForCountry, nicheMultiplier, CPM_BY_COUNTRY } from "./earnings.js";

describe("cpmTierForCountry", () => {
  it("returns the US tier", () => {
    expect(cpmTierForCountry("US")).toEqual({ min: 6, avg: 9, max: 15 });
  });
  it("is case-insensitive", () => {
    expect(cpmTierForCountry("us")).toEqual(CPM_BY_COUNTRY.US);
  });
  it("falls back to DEFAULT for unknown / null", () => {
    expect(cpmTierForCountry("ZZ")).toEqual(CPM_BY_COUNTRY.DEFAULT);
    expect(cpmTierForCountry(null)).toEqual(CPM_BY_COUNTRY.DEFAULT);
  });
});

describe("nicheMultiplier", () => {
  it("finance is the highest multiplier", () => {
    expect(nicheMultiplier("finance")).toBe(2.5);
  });
  it("kids is the lowest", () => {
    expect(nicheMultiplier("kids")).toBe(0.3);
  });
  it("null niche → 1", () => {
    expect(nicheMultiplier(null)).toBe(1);
  });
});

describe("estimateEarnings", () => {
  it("scales linearly with views", () => {
    const a = estimateEarnings({ monthlyViews: 100_000, countryCode: "US" });
    const b = estimateEarnings({ monthlyViews: 200_000, countryCode: "US" });
    expect(b.earnings.monthly.avg).toBeCloseTo(a.earnings.monthly.avg * 2, 0);
  });

  it("applies the ~45% RPM share to CPM", () => {
    const e = estimateEarnings({ monthlyViews: 0, countryCode: "US" });
    expect(e.rpmRange.avg).toBeCloseTo(9 * 0.45, 2);
  });

  it("applies niche multipliers to CPM", () => {
    const finance = estimateEarnings({ monthlyViews: 100_000, countryCode: "US", niche: "finance" });
    const gaming = estimateEarnings({ monthlyViews: 100_000, countryCode: "US", niche: "gaming" });
    expect(finance.cpmRange.avg).toBeGreaterThan(gaming.cpmRange.avg);
  });

  it("0 views → 0 earnings but valid CPM/RPM", () => {
    const e = estimateEarnings({ monthlyViews: 0, countryCode: "US" });
    expect(e.earnings.monthly.avg).toBe(0);
    expect(e.cpmRange.avg).toBeGreaterThan(0);
  });

  it("yearly is 12× monthly", () => {
    const e = estimateEarnings({ monthlyViews: 50_000, countryCode: "GB" });
    expect(e.earnings.yearly.avg).toBeCloseTo(e.earnings.monthly.avg * 12, 1);
  });

  it("no country → DEFAULT tier", () => {
    const e = estimateEarnings({ monthlyViews: 10_000 });
    expect(e.cpmRange.avg).toBe(CPM_BY_COUNTRY.DEFAULT!.avg);
  });

  it("per-video divides monthly by video count", () => {
    const e = estimateEarnings({ monthlyViews: 100_000, countryCode: "US", videoCount: 10 });
    expect(e.earnings.perVideo.avg).toBeCloseTo(e.earnings.monthly.avg / 10, 1);
  });
});
