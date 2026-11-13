import type { Valued } from "./types";

/**
 * A team's strength at each position: the average value (points per game) of
 * its best healthy players there, as many as `min` asks for (the lineup's
 * starters, plus the flex backup at RB and WR). Positions with no starter are
 * left out.
 */
export function positionStrength(
  players: readonly Valued[],
  min: Readonly<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pos, k] of Object.entries(min)) {
    if (!k) continue;
    const best = players
      .filter((p) => p.pos === pos && p.startable)
      .map((p) => p.value)
      .sort((a, b) => b - a)
      .slice(0, k);
    out[pos] = best.reduce((s, v) => s + v, 0) / k;
  }
  return out;
}

/** A team's rank at a position among every team: 1 is the strongest, ties share a rank. */
export function positionRank(
  strengths: ReadonlyMap<number, Readonly<Record<string, number>>>,
  rid: number,
  pos: string,
): number {
  const mine = strengths.get(rid)?.[pos] ?? 0;
  let rank = 1;
  for (const [other, s] of strengths) if (other !== rid && (s[pos] ?? 0) > mine) rank++;
  return rank;
}
