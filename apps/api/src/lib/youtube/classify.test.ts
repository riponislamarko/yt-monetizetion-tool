import { describe, it, expect } from "vitest";
import { classifyMonetization, type MonetizationSignals } from "./classify.js";

const base: MonetizationSignals = {
  hasJoinButton: false,
  subscriberCountRaw: 0,
  hasAdsInVideo: false,
  ytAdToken: false,
  isMadeForKids: false,
  playerAdsEnabled: false,
  adCount: 0,
};

describe("classifyMonetization — status matrix (port parity)", () => {
  it("join button → MONETIZED, high confidence", () => {
    const r = classifyMonetization({ ...base, hasJoinButton: true, subscriberCountRaw: 2000 });
    expect(r.legacyStatus).toBe("MONETIZED");
    expect(r.status).toBe("monetized");
    expect(r.confidence).toBe(94);
    expect(r.isMonetized).toBe(true);
  });

  it("ads + ad token + ≥1000 subs → MONETIZED (91)", () => {
    const r = classifyMonetization({ ...base, adCount: 2, ytAdToken: true, subscriberCountRaw: 5000 });
    expect(r.legacyStatus).toBe("MONETIZED");
    expect(r.confidence).toBe(91);
  });

  it("≥1000 subs + playerAds + not kids → LIKELY_MONETIZED", () => {
    const r = classifyMonetization({ ...base, subscriberCountRaw: 1500, playerAdsEnabled: true });
    expect(r.legacyStatus).toBe("LIKELY_MONETIZED");
    expect(r.status).toBe("likely_monetized");
    expect(r.confidence).toBe(74);
  });

  it("made-for-kids → NOT_MONETIZED (85)", () => {
    const r = classifyMonetization({ ...base, subscriberCountRaw: 5000, isMadeForKids: true });
    expect(r.legacyStatus).toBe("NOT_MONETIZED");
    expect(r.confidence).toBe(85);
  });

  it("under 500 subs → NOT_MONETIZED (85)", () => {
    const r = classifyMonetization({ ...base, subscriberCountRaw: 200 });
    expect(r.legacyStatus).toBe("NOT_MONETIZED");
    expect(r.confidence).toBe(85);
  });

  it("no ads + no token (≥500 subs) → NOT_MONETIZED", () => {
    const r = classifyMonetization({ ...base, subscriberCountRaw: 800 });
    expect(r.legacyStatus).toBe("NOT_MONETIZED");
  });

  it("ambiguous mid-band → UNKNOWN mapped to unlikely", () => {
    // ≥500 subs, has ad token (so not the no-ads branch), but <1000 and no playerAds/join.
    const r = classifyMonetization({ ...base, subscriberCountRaw: 700, ytAdToken: true });
    expect(r.legacyStatus).toBe("UNKNOWN");
    expect(r.status).toBe("unlikely");
    expect(r.confidence).toBe(42);
  });
});

describe("classifyMonetization — score", () => {
  it("ad presence is the strongest single contributor", () => {
    const withAds = classifyMonetization({ ...base, adCount: 1 }).score;
    const withSubs = classifyMonetization({ ...base, subscriberCountRaw: 2000 }).score;
    expect(withAds).toBeGreaterThan(withSubs);
  });

  it("made-for-kids penalises the score", () => {
    const kids = classifyMonetization({ ...base, adCount: 1, isMadeForKids: true }).score;
    const notKids = classifyMonetization({ ...base, adCount: 1 }).score;
    expect(kids).toBeLessThan(notKids);
  });

  it("score is clamped to 0..100", () => {
    const r = classifyMonetization({
      ...base,
      hasJoinButton: true,
      adCount: 3,
      ytAdToken: true,
      playerAdsEnabled: true,
      subscriberCountRaw: 100000,
      topicAligned: true,
    });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
