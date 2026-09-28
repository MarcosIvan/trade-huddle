const LOCALE = "en-US";

/** A number with fixed decimals, or an en dash when missing. */
export function fmt(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "–";
  return x.toLocaleString(LOCALE, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A change with an explicit sign: +1.2, −0.4, 0.0. Uses a real minus sign. */
export function signed(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "–";
  const r = Math.round(x * 10 ** digits) / 10 ** digits;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + fmt(Math.abs(r), digits);
}

export const pct = (x: number): string => `${Math.round(x * 100)}%`;

export function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? "th");
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(LOCALE, { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Direction of a change, for styling and for the arrow shown next to it. */
export function trend(d: number, threshold = 0.05): "up" | "down" | "flat" {
  return d > threshold ? "up" : d < -threshold ? "down" : "flat";
}
