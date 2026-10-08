/**
 * How hard a matchup is: what the opponent's defense allows to a position
 * against the league average (1 = average), as from defenseFactors. Shared by
 * the weekly lineup and the player card.
 */

/** How a defense treats a position: good allows more than average, tough fewer. */
export type MatchupLevel = "good" | "neutral" | "tough";

/** A defense allowing at least this share more (or fewer) points than average is good (or tough). */
export const MATCHUP_EDGE = 0.08;

export function matchupLevel(factor: number): MatchupLevel {
  // A hair of tolerance, so 0.92 counts as 8% below average despite floating point.
  const diff = factor - 1;
  const edge = MATCHUP_EDGE - 1e-9;
  return diff >= edge ? "good" : diff <= -edge ? "tough" : "neutral";
}

/** The matchup in words, for a tooltip: "BUF allows 12% fewer points than average to RBs". */
export function matchupNote(opponent: string, factor: number, pos: string): string {
  const diff = factor - 1;
  if (matchupLevel(factor) === "neutral") return `${opponent} allows about the average to ${pos}s`;
  const pct = Math.round(Math.abs(diff) * 100);
  return `${opponent} allows ${pct}% ${diff > 0 ? "more" : "fewer"} points than average to ${pos}s`;
}
