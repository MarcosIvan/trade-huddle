/**
 * Periods: what one entry of a player's season is in the stats file. In the
 * NFL a period is a week (one game a week); in the NBA it is a game day, and
 * a fantasy week holds several of them (ADR 0019).
 */
import type { StatsFile } from "./types";

/** The periods of a fantasy week, in order: the week itself, or its game days. */
export function weekPeriods(stats: StatsFile, week: number): number[] {
  if (stats.period !== "day") return [week];
  return Object.entries(stats.day_weeks ?? {})
    .filter(([, w]) => w === week)
    .map(([day]) => Number(day))
    .sort((a, b) => a - b);
}

/** The periods of the week to set a lineup for (none after the season). */
export function lineupPeriods(stats: StatsFile): number[] {
  return stats.lineup_week == null ? [] : weekPeriods(stats, stats.lineup_week);
}

/**
 * The first period still to play: the lineup week's first period, or the one
 * after the last period played when the season has no lineup week.
 */
export function currentPeriod(stats: StatsFile): number {
  return lineupPeriods(stats)[0] ?? Math.max(0, ...stats.weeks) + 1;
}

/** The fantasy week of a period. */
export function periodWeek(stats: StatsFile, period: number): number {
  return stats.period === "day" ? (stats.day_weeks?.[String(period)] ?? 0) : period;
}
