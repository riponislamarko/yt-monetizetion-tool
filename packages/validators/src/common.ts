import { z } from "zod";

/**
 * Which data layer produced a value (§0 data-source hierarchy). Lives in its own module so
 * both the envelope (index.ts) and the per-tool schemas (tools.ts) can import it without a
 * circular dependency.
 */
export const signalSourceSchema = z.enum(["innertube", "scrape", "api", "mixed", "computed"]);
export type SignalSource = z.infer<typeof signalSourceSchema>;
