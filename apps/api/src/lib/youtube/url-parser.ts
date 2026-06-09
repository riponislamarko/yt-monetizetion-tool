import { InvalidUrlError } from "@yt/validators/errors";

export type ParsedKind = "channel" | "handle" | "slug" | "video";

export interface ParsedUrl {
  type: ParsedKind;
  id?: string;
  handle?: string;
  slug?: string;
  /** Which legacy resolution path a slug came from. */
  slugSource?: "c" | "user";
  canonicalUrl: string;
}

const VIDEO_ID_RE = /^([\w-]{11})/;
const CHANNEL_ID_RE = /^UC[\w-]{10,}$/i;

function sanitizeVideoId(v: string): string {
  const m = VIDEO_ID_RE.exec(String(v).trim());
  return m?.[1] ?? "";
}

/**
 * Parse any YouTube URL or bare identifier into structured parts.
 * Ported from the prototype's parseUrl, extended to cover /embed/ and /live/ surfaces.
 * Throws InvalidUrlError (400) on anything that is not a recognizable YouTube target.
 */
export function parseUrl(input: string): ParsedUrl {
  if (typeof input !== "string" || !input.trim()) {
    throw new InvalidUrlError("URL is required.");
  }

  let raw = input.trim();

  // Bare 11-char video id or UC… channel id with no host.
  if (!/^https?:\/\//i.test(raw) && !raw.includes("/") && !raw.includes(".")) {
    if (CHANNEL_ID_RE.test(raw)) {
      return { type: "channel", id: raw, canonicalUrl: `https://www.youtube.com/channel/${raw}` };
    }
    if (/^[\w-]{11}$/.test(raw)) {
      return { type: "video", id: raw, canonicalUrl: `https://www.youtube.com/watch?v=${raw}` };
    }
    if (raw.startsWith("@")) {
      return {
        type: "handle",
        handle: raw,
        canonicalUrl: `https://www.youtube.com/${encodeURIComponent(raw)}`,
      };
    }
  }

  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError("That does not look like a valid URL.");
  }

  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host !== "youtube.com" && host !== "youtu.be" && host !== "m.youtube.com") {
    throw new InvalidUrlError("Only YouTube URLs are supported.");
  }

  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];

  // youtu.be/VIDEO_ID
  if (host === "youtu.be" && first) {
    const id = sanitizeVideoId(first);
    if (!id) throw new InvalidUrlError("Could not parse a video ID from the short link.");
    return { type: "video", id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  // /watch?v=
  if (first === "watch") {
    const id = sanitizeVideoId(url.searchParams.get("v") ?? "");
    if (!id) throw new InvalidUrlError("Missing or invalid video ID in the watch URL.");
    return { type: "video", id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }

  // /shorts/ID, /embed/ID, /live/ID, /v/ID
  if ((first === "shorts" || first === "embed" || first === "live" || first === "v") && parts[1]) {
    const id = sanitizeVideoId(parts[1]);
    if (!id) throw new InvalidUrlError(`Could not parse a video ID from the ${first} URL.`);
    const canonical =
      first === "shorts"
        ? `https://www.youtube.com/shorts/${id}`
        : `https://www.youtube.com/watch?v=${id}`;
    return { type: "video", id, canonicalUrl: canonical };
  }

  // /channel/UC…
  if (first === "channel" && parts[1]) {
    const id = parts[1];
    if (!CHANNEL_ID_RE.test(id)) throw new InvalidUrlError("Invalid channel ID format.");
    return { type: "channel", id, canonicalUrl: `https://www.youtube.com/channel/${id}` };
  }

  // /@Handle
  if (first?.startsWith("@")) {
    return {
      type: "handle",
      handle: first,
      canonicalUrl: `https://www.youtube.com/${encodeURIComponent(first)}`,
    };
  }

  // /c/Custom and /user/Legacy
  if (first === "c" && parts[1]) {
    return {
      type: "slug",
      slug: decodeURIComponent(parts[1]),
      slugSource: "c",
      canonicalUrl: `https://www.youtube.com/c/${encodeURIComponent(parts[1])}`,
    };
  }
  if (first === "user" && parts[1]) {
    return {
      type: "slug",
      slug: decodeURIComponent(parts[1]),
      slugSource: "user",
      canonicalUrl: `https://www.youtube.com/user/${encodeURIComponent(parts[1])}`,
    };
  }

  throw new InvalidUrlError("Unsupported YouTube URL format.");
}
