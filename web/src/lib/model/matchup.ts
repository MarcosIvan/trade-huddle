/**
 * How hard a matchup is. Each defense's factor (what it allows to a position
 * against the league average, 1 = average, from defenseFactors) is ranked
 * among every defense's for that position; the easiest quarter is good and
 * the hardest quarter tough (ADR 0036). Shared by the weekly lineup, the
 * player card and the analyzer's schedule.
 */
import { ordinal } from "../format";

/** How a defense treats a position: good allows more than most, tough fewer. */
export type MatchupLevel = "good" | "neutral" | "tough";

/** Defense factors by team and position (1 = average), as from defenseFactors. */
export type DefenseFactors = ReadonlyMap<string, ReadonlyMap<string, number>>;

/** Share of the defenses, at each end of a position's ranking, rated good or tough: 8 of 32. */
export const MATCHUP_SHARE = 0.25;

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
 * Ranks every defense for every position. Good: among the easiest quarter and
 * allowing more than average; tough: among the hardest quarter and allowing
 * fewer. Defenses with the same factor share a place, so a league where every
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
      const ends = Math.round(of * MATCHUP_SHARE);
      const above = all.filter((f) => f > factor).length;
      const below = all.filter((f) => f < factor).length;
      const level: MatchupLevel =
        above < ends && factor > 1 ? "good" : below < ends && factor < 1 ? "tough" : "neutral";
      ratings.set(pos, { factor, rank: above + 1, of, level });
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
