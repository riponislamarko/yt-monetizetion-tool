import { describe, it, expect } from "vitest";
import { parseUrl } from "./url-parser.js";
import { InvalidUrlError } from "@yt/validators/errors";

describe("parseUrl — channels", () => {
  it("parses /channel/UC…", () => {
    const p = parseUrl("https://www.youtube.com/channel/UCabcdefghij1234567890");
    expect(p.type).toBe("channel");
    expect(p.id).toBe("UCabcdefghij1234567890");
    expect(p.canonicalUrl).toContain("/channel/UC");
  });

  it("parses a bare UC… id", () => {
    const p = parseUrl("UCabcdefghij1234567890");
    expect(p.type).toBe("channel");
  });

  it("parses /@handle", () => {
    const p = parseUrl("https://www.youtube.com/@MrBeast");
    expect(p.type).toBe("handle");
    expect(p.handle).toBe("@MrBeast");
  });

  it("parses a bare @handle", () => {
    expect(parseUrl("@MrBeast").type).toBe("handle");
  });

  it("parses /c/custom as slug(c)", () => {
    const p = parseUrl("https://www.youtube.com/c/LinusTechTips");
    expect(p.type).toBe("slug");
    expect(p.slugSource).toBe("c");
    expect(p.slug).toBe("LinusTechTips");
  });

  it("parses /user/legacy as slug(user)", () => {
    const p = parseUrl("https://www.youtube.com/user/PewDiePie");
    expect(p.type).toBe("slug");
    expect(p.slugSource).toBe("user");
  });
});

describe("parseUrl — videos", () => {
  it("parses /watch?v=", () => {
    const p = parseUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(p.type).toBe("video");
    expect(p.id).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be short links", () => {
    expect(parseUrl("https://youtu.be/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
  });

  it("parses /shorts/ and keeps a shorts canonical", () => {
    const p = parseUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(p.type).toBe("video");
    expect(p.canonicalUrl).toContain("/shorts/");
  });

  it("parses /embed/ and /live/ and /v/", () => {
    expect(parseUrl("https://www.youtube.com/embed/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
    expect(parseUrl("https://www.youtube.com/live/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
    expect(parseUrl("https://www.youtube.com/v/dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
  });

  it("parses a bare 11-char video id", () => {
    expect(parseUrl("dQw4w9WgXcQ").type).toBe("video");
  });

  it("strips extra params from a watch id", () => {
    expect(parseUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PL").id).toBe("dQw4w9WgXcQ");
  });

  it("handles m.youtube.com", () => {
    expect(parseUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ").id).toBe("dQw4w9WgXcQ");
  });
});

describe("parseUrl — errors", () => {
  it("rejects empty input", () => {
    expect(() => parseUrl("")).toThrow(InvalidUrlError);
  });
  it("rejects non-YouTube hosts", () => {
    expect(() => parseUrl("https://vimeo.com/12345")).toThrow(InvalidUrlError);
  });
  it("rejects a watch URL with no v param", () => {
    expect(() => parseUrl("https://www.youtube.com/watch")).toThrow(InvalidUrlError);
  });
});
