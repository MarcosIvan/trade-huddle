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
 * The lineup week's periods still to play, for a team when given. Periods
 * after the last one played are ahead for everyone. A period some teams
 * already played (the NFL's Thursday game) is still ahead for a team whose
 * game is not in the stats yet (`team_weeks`, NFL only).
 */
export function periodsAhead(stats: StatsFile, team?: string): number[] {
  const lastPlayed = Math.max(0, ...stats.weeks);
  const played = team && stats.team_weeks ? (stats.team_weeks[team] ?? {}) : null;
  return lineupPeriods(stats).filter(
    (period) => period > lastPlayed || (played !== null && !(String(period) in played)),
  );
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

/** A period's date (YYYY-MM-DD) in game-day files; null for weeks. */
export function periodDate(stats: StatsFile, period: number): string | null {
  return stats.period === "day" ? (stats.day_dates?.[String(period)] ?? null) : null;
}
