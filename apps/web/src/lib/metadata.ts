import type { Metadata } from "next";
import { getTool } from "./tools";

/** Build per-tool page metadata (title, description, canonical) from the tools registry. */
export function toolMetadata(slug: string): Metadata {
  const tool = getTool(slug);
  if (!tool) return {};
  return {
    title: tool.title,
    description: tool.description,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: `${tool.title} | TubeIntel`,
      description: tool.description,
      url: `/${slug}`,
    },
  };
}
