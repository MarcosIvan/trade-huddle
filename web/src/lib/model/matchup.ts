/**
 * How hard a matchup is. Each defense's factor (what it allows to a position
 * against the league average, 1 = average, from defenseFactors) is ranked
 * among every defense's for that position, then split in five: great,
 * good, neutral, tough and brutal (ADR 0037, amending ADR 0036). Shared
 * by the weekly lineup, the player card and the analyzer's schedule.
 */
import { ordinal } from "../format";

/** How a defense treats a position, from the easiest (great) to the hardest (brutal). */
export type MatchupLevel = "great" | "good" | "neutral" | "tough" | "brutal";

/** The five levels, easiest first. */
export const MATCHUP_LEVELS: readonly MatchupLevel[] = [
  "great",
  "good",
  "neutral",
  "tough",
  "brutal",
];

/** Great or good: the opponent is among the easier ones. */
export const isGood = (l: MatchupLevel) => l === "great" || l === "good";
/** Tough or brutal: the opponent is among the harder ones. */
export const isTough = (l: MatchupLevel) => l === "tough" || l === "brutal";

/** Defense factors by team and position (1 = average), as from defenseFactors. */
export type DefenseFactors = ReadonlyMap<string, ReadonlyMap<string, number>>;

/**
 * Share of a ranking, at each end, rated good or better (and tough or worse):
 * 13 of 32, so only the middle fifth is neutral.
 */
export const MATCHUP_SHARE = 0.4;
/** Share at each end rated great (and brutal): 6 of 32. */
export const MATCHUP_STRONG_SHARE = 0.2;

/**
 * The level of a place in a ranking of `of`, given how many rank above it
 * (allow more) and below it (allow fewer). The good side needs a factor above
 * average and the tough side one below, so ties at the average stay neutral.
 */
export function rankLevel(above: number, below: number, of: number, factor: number): MatchupLevel {
  const strong = Math.round(of * MATCHUP_STRONG_SHARE);
  const ends = Math.round(of * MATCHUP_SHARE);
  if (factor > 1 && above < ends) return above < strong ? "great" : "good";
  if (factor < 1 && below < ends) return below < strong ? "brutal" : "tough";
  return "neutral";
}

export interface MatchupRating {
  /** What the defense allows to the position against the league average (1 = average). */
  factor: number;
  /** Its place among every defense for the position: 1 = allows the most (the easiest). */
  rank: number;
  /** Defenses ranked. */
  of: number;
  level: MatchupLevel;
}

/** Ratings by defense, then position. */
export type MatchupRatings = ReadonlyMap<string, ReadonlyMap<string, MatchupRating>>;

/**
 * Ranks every defense for every position. Great: among the easiest fifth
 * (6 of 32); good: the next ones down to 13; the middle fifth neutral; then
 * tough and brutal, mirrored. Good needs a factor above average, tough
 * one below. Defenses with the same factor share a place, so a league where every
 * defense is still average (no games yet) has no good or tough matchup.
 */
export function matchupRatings(factors: DefenseFactors): Map<string, Map<string, MatchupRating>> {
  const byPos = new Map<string, number[]>();
  for (const perPos of factors.values()) {
    for (const [pos, f] of perPos) byPos.set(pos, [...(byPos.get(pos) ?? []), f]);
  }
  const out = new Map<string, Map<string, MatchupRating>>();
  for (const [defense, perPos] of factors) {
    const ratings = new Map<string, MatchupRating>();
    for (const [pos, factor] of perPos) {
      const all = byPos.get(pos)!;
      const of = all.length;
      const above = all.filter((f) => f > factor).length;
      const below = all.filter((f) => f < factor).length;
      ratings.set(pos, { factor, rank: above + 1, of, level: rankLevel(above, below, of, factor) });
    }
    out.set(defense, ratings);
  }
  return out;
}

/**
 * The matchup in words, for a tooltip:
 * "BUF is the 6th easiest defense of 32 for RBs (allows 4% more points than average)".
 */
export function matchupNote(opponent: string, r: MatchupRating, pos: string): string {
  const diff = r.factor - 1;
  const pct = Math.round(Math.abs(diff) * 100);
  const allows =
    pct === 0
      ? "allows about the average"
      : `allows ${pct}% ${diff > 0 ? "more" : "fewer"} points than average`;
  const place = r.rank === 1 ? "the easiest" : `the ${ordinal(r.rank)} easiest`;
  return `${opponent} is ${place} defense of ${r.of} for ${pos}s (${allows})`;
}
