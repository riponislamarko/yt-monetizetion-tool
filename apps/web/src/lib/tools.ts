import {
  BadgeDollarSign,
  Calculator,
  EyeOff,
  IdCard,
  Image as ImageIcon,
  ImageDown,
  ScrollText,
  Tags,
  type LucideIcon,
} from "lucide-react";

/** Canonical metadata for the 8 tools. Drives the homepage grid, related-tools links,
 * page SEO and the per-page headers. `slug` matches both the route and the API path. */
export interface ToolMeta {
  slug: string;
  /** API tool name (POST /api/tools/<name>). Same as slug for all current tools. */
  apiName: string;
  title: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** Homepage grouping, mirroring ytlarge.com's primary/secondary split. */
  category: "primary" | "secondary";
}

export const TOOLS: ToolMeta[] = [
  {
    slug: "monetization-checker",
    apiName: "monetization-checker",
    title: "Monetization Checker",
    short: "Is this channel or video monetized?",
    description:
      "Detect ads, join buttons and eligibility signals to estimate whether a YouTube channel or video is monetized.",
    icon: BadgeDollarSign,
    category: "primary",
  },
  {
    slug: "channel-id-finder",
    apiName: "channel-id-finder",
    title: "Channel ID Finder",
    short: "Get the UC… ID from any URL",
    description:
      "Resolve a handle, custom URL, username or video link into the canonical channel ID and channel details.",
    icon: IdCard,
    category: "primary",
  },
  {
    slug: "data-viewer",
    apiName: "data-viewer",
    title: "Data Viewer",
    short: "Full metadata + derived metrics",
    description:
      "View rich metadata for a video or channel plus derived metrics like engagement rate and upload frequency.",
    icon: ScrollText,
    category: "primary",
  },
  {
    slug: "image-tool",
    apiName: "image-tool",
    title: "Image Tool",
    short: "Avatars, banners & thumbnails",
    description:
      "Grab a channel's profile pictures and banner images, or a video's thumbnails, in every available size.",
    icon: ImageIcon,
    category: "primary",
  },
  {
    slug: "tag-extractor",
    apiName: "tag-extractor",
    title: "Tag Extractor",
    short: "Pull tags & keywords",
    description:
      "Extract the tags from a video or the keywords from a channel, ready to copy with a character counter.",
    icon: Tags,
    category: "secondary",
  },
  {
    slug: "money-calculator",
    apiName: "money-calculator",
    title: "Money Calculator",
    short: "Estimate earnings & CPM",
    description:
      "Estimate potential YouTube earnings from a URL or manual inputs using per-country CPM and niche multipliers.",
    icon: Calculator,
    category: "secondary",
  },
  {
    slug: "shadowban-detector",
    apiName: "shadowban-detector",
    title: "Shadowban Detector",
    short: "Check channel visibility",
    description:
      "Run visibility checks to detect whether a channel may be shadowbanned or limited in search.",
    icon: EyeOff,
    category: "secondary",
  },
  {
    slug: "thumbnail-downloader",
    apiName: "thumbnail-downloader",
    title: "Thumbnail Downloader",
    short: "Download video thumbnails",
    description:
      "Download a YouTube video's thumbnails in every resolution, with direct image links.",
    icon: ImageDown,
    category: "secondary",
  },
];

export function getTool(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

/** Up to `count` other tools, for the related-tools section. */
export function relatedTools(slug: string, count = 3): ToolMeta[] {
  return TOOLS.filter((t) => t.slug !== slug).slice(0, count);
}
