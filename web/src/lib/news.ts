/** One news item about a player, as Sleeper's app shows it. */
export interface NewsItem {
  title: string;
  /** The short report (what happened); may be empty. */
  summary: string;
  /** The original article, when the source gives one. */
  url: string | null;
  source: string;
  /** Publication time, epoch milliseconds. */
  time: number;
}

/** Items shown per player: the latest ones. */
export const NEWS_LIMIT = 5;

const SOURCE_NAMES: Record<string, string> = {
  rotowire: "RotoWire",
  rotoballer: "RotoBaller",
  fantasy_pros: "FantasyPros",
};

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const text = (x: unknown, max: number): string =>
  typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "";

/** Only plain web links: a javascript: or data: URL must never become an href. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** "rotowire" -> "RotoWire"; an unknown source keeps its name, made readable. */
export function sourceName(source: string): string {
  return SOURCE_NAMES[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function item(raw: unknown): NewsItem | null {
  if (!isObject(raw) || !isObject(raw.metadata)) return null;
  const { metadata, source, published } = raw;
  const title = text(metadata.title, 300);
  const time = typeof published === "number" && Number.isFinite(published) ? published : NaN;
  if (!title || Number.isNaN(time)) return null;
  return {
    title,
    summary: text(metadata.description, 1000),
    url: safeUrl(metadata.url),
    source: sourceName(text(source, 40) || "Sleeper"),
    time,
  };
}

/**
 * A player's news from Sleeper, checked item by item (the text comes from
 * third parties): the latest {@link NEWS_LIMIT}, newest first.
 */
export function parsePlayerNews(x: unknown): NewsItem[] {
  if (!Array.isArray(x)) return [];
  return x
    .map(item)
    .filter((n): n is NewsItem => n !== null)
    .sort((a, b) => b.time - a.time)
    .slice(0, NEWS_LIMIT);
}

/** "5 min ago", "3 h ago", "2 days ago"; the date itself past a week. */
export function timeAgo(time: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days <= 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
