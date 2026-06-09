import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Compact number formatting: 1234567 -> "1.2M". Returns "Unknown" for null. */
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Full grouped number: 1234567 -> "1,234,567". Returns "Unknown" for null. */
export function formatFullNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US").format(n);
}

/** USD currency, no cents. */
export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 100 ? 2 : 0,
  }).format(n);
}

/** Render a value that may be null/empty as a human "Unknown" placeholder. */
export function orUnknown(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return "Unknown";
  return value;
}

/** ISO date string -> "Jan 1, 2024". Returns "Unknown" for null/invalid. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Seconds -> "1:02:03" / "3:24". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "Unknown";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => x.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Bytes -> "1.2 MB". */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/** Percent from a 0..1 ratio. */
export function formatPercent(ratio: number | null | undefined, fractionDigits = 2): string {
  if (ratio === null || ratio === undefined) return "Unknown";
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}
