import { NBA } from "./nba";
import { NFL } from "./nfl";
import type { SportConfig } from "./types";

/** Every sport the site supports, by Sleeper's sport id. */
export const SPORTS: Readonly<Record<string, SportConfig>> = { nfl: NFL, nba: NBA };

/** A league's sport (the NFL when Sleeper does not say, as older leagues do). */
export function sportOf(id: string | undefined): SportConfig {
  return SPORTS[id ?? "nfl"] ?? NFL;
}

/** Every position a player can play, in the sport's order (his main one first on a tie). */
export function playablePositions(
  player: { pos: string; elig: readonly string[] },
  sport: SportConfig,
): string[] {
  const order = sport.positions;
  const rank = (p: string) => (order.includes(p) ? order.indexOf(p) : order.length);
  return [...new Set([player.pos, ...player.elig])].sort((a, b) => rank(a) - rank(b));
}
