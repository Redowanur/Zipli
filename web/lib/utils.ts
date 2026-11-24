export { cn } from "cn";

export const fmt = (n: number) => n.toLocaleString("en-US");

export function compact(n: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function timeAgo(iso: string) {
  const s = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [sec, label] of units) if (s >= sec) return `${Math.floor(s / sec)}${label} ago`;
  return "just now";
}

export function flag(cc: string) {
  if (!/^[A-Z]{2}$/.test(cc) || cc === "XX") return "🌐";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function countryName(cc: string) {
  if (cc === "XX") return "Unknown";
  try { return new Intl.DisplayNames(["en"], { type: "region" }).of(cc) ?? cc; } catch { return cc; }
}

export function host(url: string) {
  try { return new URL(url).host; } catch { return url; }
}

// Fill missing days with 0 so charts show a continuous timeline.
export function fillDays(series: { key: string; clicks: number }[], days: number) {
  const map = new Map(series.map((b) => [b.key, b.clicks]));
  const out: { key: string; clicks: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    const k = d.toISOString().slice(0, 10);
    out.push({ key: k, clicks: map.get(k) ?? 0 });
  }
  return out;
}

// Primary call-to-action look (shadcn Button + brand gradient).
export const gradientBtn =
  "border-0 bg-gradient-to-r from-violet to-cyan text-white shadow-[0_8px_30px_-8px_rgb(139_92_246/0.7)] transition-[filter,box-shadow] hover:brightness-110 hover:shadow-[0_8px_40px_-6px_rgb(34_211_238/0.5)]";
