import type { MoneyCalculatorRequest, MoneyCalculatorResult, SignalSource } from "@yt/validators";
import type { AppContext } from "../context.js";
import type { ServiceOutput } from "../routes/tools/_factory.js";
import { parseUrl } from "../lib/youtube/url-parser.js";
import { estimateEarnings, EARNINGS_DISCLAIMER, type Niche } from "../lib/youtube/earnings.js";
import { fetchChannelBundle, fetchVideoBundle, resolveChannelId } from "./shared.js";

const NICHE_KEYWORDS: Array<{ niche: Niche; re: RegExp }> = [
  { niche: "finance", re: /(finance|invest|stock|crypto|money|trading)/i },
  { niche: "business", re: /(business|entrepreneur|marketing|startup)/i },
  { niche: "tech", re: /(tech|software|programming|gadget|coding|computer)/i },
  { niche: "health", re: /(health|fitness|medical|wellness|nutrition)/i },
  { niche: "education", re: /(education|learn|tutorial|course|science|how)/i },
  { niche: "gaming", re: /(gaming|game|esport|gameplay)/i },
  { niche: "lifestyle", re: /(lifestyle|vlog|travel|fashion|beauty)/i },
  { niche: "comedy", re: /(comedy|funny|prank|humor)/i },
  { niche: "kids", re: /(kids|children|nursery|cartoon|toy)/i },
  { niche: "entertainment", re: /(entertainment|music|movie|reaction|celebrity)/i },
];

function detectNiche(topics: string[], keywords: string[], title: string | null): Niche | null {
  const hay = [...topics, ...keywords, title ?? ""].join(" ");
  for (const { niche, re } of NICHE_KEYWORDS) if (re.test(hay)) return niche;
  return null;
}

function deriveMonthlyViews(totalViews: number | null, createdAt: string | null): number | null {
  if (!totalViews || !createdAt) return null;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return null;
  const months = Math.max(1, (Date.now() - created) / (1000 * 60 * 60 * 24 * 30.4));
  return Math.round(totalViews / months);
}

export async function runMoneyCalculator(
  body: MoneyCalculatorRequest,
  ctx: AppContext,
): Promise<ServiceOutput<MoneyCalculatorResult>> {
  // Manual mode — no URL.
  if (!body.url) {
    const monthlyViews = body.monthlyViews ?? 0;
    const niche = (body.niche ?? null) as Niche | null;
    const est = estimateEarnings({ monthlyViews, countryCode: body.country ?? null, niche });
    const data: MoneyCalculatorResult = {
      channelTitle: null,
      subscriberCount: null,
      totalViews: null,
      monthlyViews,
      estimatedCountry: body.country?.toUpperCase() ?? null,
      detectedNiche: niche,
      cpmRange: est.cpmRange,
      rpmRange: est.rpmRange,
      earnings: est.earnings,
      disclaimer: EARNINGS_DISCLAIMER,
    };
    return { data, signalSource: "computed" };
  }

  const parsed = parseUrl(body.url);

  if (parsed.type === "video") {
    const v = await fetchVideoBundle(parsed.id!, ctx);
    const monthlyViews = body.monthlyViews ?? v.viewCount ?? 0;
    const niche = (body.niche as Niche | null) ?? detectNiche(v.dataApi?.topicCategories ?? [], v.dataApi?.tags ?? [], v.title);
    const country = body.country ?? null;
    const est = estimateEarnings({ monthlyViews, countryCode: country, niche });
    const data: MoneyCalculatorResult = {
      channelTitle: v.ownerName,
      subscriberCount: null,
      totalViews: v.viewCount,
      monthlyViews,
      estimatedCountry: country?.toUpperCase() ?? null,
      detectedNiche: niche,
      cpmRange: est.cpmRange,
      rpmRange: est.rpmRange,
      earnings: est.earnings,
      disclaimer: EARNINGS_DISCLAIMER,
    };
    return { data, signalSource: v.source };
  }

  const channelId = await resolveChannelId(parsed, ctx);
  const c = await fetchChannelBundle(channelId, ctx);
  const totalViews = c.dataApi?.viewCount ?? null;
  const monthlyViews = body.monthlyViews ?? deriveMonthlyViews(totalViews, c.dataApi?.publishedAt ?? null) ?? 0;
  const country = body.country ?? c.dataApi?.country ?? c.signals.country ?? null;
  const niche = (body.niche as Niche | null) ?? detectNiche(c.topics, c.signals.keywords, c.signals.channelName);
  const est = estimateEarnings({ monthlyViews, countryCode: country, niche, videoCount: c.videoCount ?? 1 });

  const sources: SignalSource[] = [c.source];
  const data: MoneyCalculatorResult = {
    channelTitle: c.signals.channelName ?? c.dataApi?.title ?? null,
    subscriberCount: c.subscriberCount,
    totalViews,
    monthlyViews,
    estimatedCountry: country?.toUpperCase() ?? null,
    detectedNiche: niche,
    cpmRange: est.cpmRange,
    rpmRange: est.rpmRange,
    earnings: est.earnings,
    disclaimer: EARNINGS_DISCLAIMER,
  };
  return { data, signalSource: sources[0]! };
}
