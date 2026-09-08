import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskLevel } from "@/lib/types/database";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Map risk score (0-1) to level string */
export function scoreToLevel(score: number): RiskLevel {
  if (score >= 0.80) return "critical";
  if (score >= 0.55) return "high";
  if (score >= 0.30) return "medium";
  return "low";
}

/** Format risk score as percentage */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Format large numbers with Indian commas */
export function formatIndianNumber(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)} Cr`;
  if (n >= 100_000)    return `${(n / 100_000).toFixed(1)} L`;
  if (n >= 1_000)      return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

/** Format rainfall value */
export function formatRainfall(mm: number): string {
  if (mm >= 1000) return `${(mm / 1000).toFixed(2)} m`;
  return `${mm.toFixed(1)} mm`;
}

/** Time ago formatter */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hrs < 24)   return `${hrs}h ago`;
  return `${days}d ago`;
}

/** Get risk badge CSS classes */
export function getRiskBadgeClass(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    critical: "bg-red-500/15 text-red-400 border border-red-500/30",
    high:     "bg-orange-500/15 text-orange-400 border border-orange-500/30",
    medium:   "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30",
    low:      "bg-green-500/15 text-green-400 border border-green-500/30",
  };
  return map[level];
}

/** Map risk level to MapLibre fill colour */
export function riskLevelToColor(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    critical: "#ef4444",
    high:     "#f97316",
    medium:   "#eab308",
    low:      "#22c55e",
  };
  return map[level];
}

/** Get emoji for risk level */
export function riskEmoji(level: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    critical: "🔴",
    high:     "🟠",
    medium:   "🟡",
    low:      "🟢",
  };
  return map[level];
}

/** Clamp a number between min and max */
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Build R2 public URL from object key */
export function r2Url(key: string): string {
  const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  return `${base}/${key}`;
}

/** Truncate text to max length */
export function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
