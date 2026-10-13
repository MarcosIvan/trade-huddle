/**
 * Durability: the share of his team's games a player takes part in. A
 * per-game value says how good he is when he plays; in a long season (the
 * NBA's 82 games) the games he misses also cost his fantasy team.
 */
import type { DurabilityParams } from "../sports/types";
import type { Player, StatsFile } from "./types";

/** Games his teams have played this season, through the last period in the file. */
export function teamGames(stats: StatsFile, player: Pick<Player, "id" | "team">): number {
  const last = Math.max(0, ...stats.weeks);
  // The teams he played for, by day: on each day, the last one by then (the first before that).
  const known = Object.entries(stats.players[player.id]?.tw ?? {})
    .map(([d, t]) => [Number(d), t] as const)
    .sort((a, b) => a[0] - b[0]);
  const days = Object.keys(stats.schedule ?? {})
    .map(Number)
    .filter((d) => d <= last)
    .sort((a, b) => a - b);
  let team = known[0]?.[1] ?? player.team;
  let next = 0;
  let n = 0;
  for (const d of days) {
    while (next < known.length && known[next]![0] <= d) team = known[next++]![1];
    if (team && stats.schedule![String(d)]!.some((g) => g.includes(team))) n++;
  }
  return n;
}

/**
 * Share of his team's games he plays, 0 to 1: this season's games and last
 * season's (weighted by `lastSeason`), pulled toward a typical player's share
 * as if he had `shrinkGames` more team games at that rate.
 */
export function durability(
  stats: StatsFile,
  player: Pick<Player, "id" | "team" | "g" | "prevG">,
  params: DurabilityParams,
): number {
  const prevTeamGames = player.prevG > 0 ? (stats.season_games ?? 82) : 0;
  const played = params.lastSeason * player.prevG + player.g + params.shrinkGames * params.typical;
  const possible =
    params.lastSeason * prevTeamGames + teamGames(stats, player) + params.shrinkGames;
  return Math.min(1, played / possible);
}
