import type { MetadataRoute } from "next";
import { TOOLS } from "@/lib/tools";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, priority: 1 },
    ...TOOLS.map((t) => ({
      url: `${SITE_URL}/${t.slug}`,
      lastModified: now,
      priority: 0.8,
    })),
  ];
}
