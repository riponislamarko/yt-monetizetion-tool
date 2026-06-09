import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { toolMetadata } from "@/lib/metadata";
import { Client } from "./Client";

const SLUG = "tag-extractor";
export const metadata: Metadata = toolMetadata(SLUG);

export default function Page() {
  return (
    <ToolPageShell slug={SLUG}>
      <Client />
    </ToolPageShell>
  );
}
