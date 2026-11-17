/**
 * A team's strength in a week still to play, for the playoff odds: its best
 * lineup in each of the week's periods, from the players whose team plays
 * then, added up. In the NFL a player on a bye sits that week out and the
 * bench fills in; in the NBA a week is several game days, so a roster with
 * more games that week scores more. Injuries count by the week (ADR 0041).
 */
import type { ModelParams, SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { weekPeriods } from "./periods";
import type { Player, StatsFile } from "./types";
import { opponents } from "./weekly";

/**
 * What a player is expected to give in a week left, per game:
 * - out of the season, or with no team: nothing;
 * - in the lineup week: his healthy value times his chance to play it (the
 *   sport's weekAvailability: out 0, questionable 85% in the NFL);
 * - later, after a game-to-game injury (out, doubtful, questionable): his
 *   healthy value, back from it;
 * - later, after a long one (IR, PUP): his value as the model has it, which
 *   already leaves out the share of the season he is expected to miss.
 */
export function weekValue(
  p: Player,
  week: number,
  lineupWeek: number | null,
  params: ModelParams,
): number {
  const rule = p.inj ? params.injury[p.inj] : undefined;
  const longOut = rule?.startable === false;
  if (p.seasonOver || (!p.startable && !longOut)) return 0;
  const healthy = p.injMult > 0 ? p.value / p.injMult : p.value;
  if (week === lineupWeek) return healthy * (p.inj ? (params.weekAvailability[p.inj] ?? 1) : 1);
  return longOut ? p.value : healthy;
}

/** Null when the schedule does not have the week. */
export function weekStrength(
  players: readonly Player[],
  stats: StatsFile,
  week: number,
  slots: readonly string[],
  sport: SportConfig,
): number | null {
  const periods = weekPeriods(stats, week).filter((p) => stats.schedule?.[String(p)]?.length);
  if (!periods.length) return null;
  const rated = players.map((p) => {
    const value = weekValue(p, week, stats.lineup_week ?? null, sport.model);
    return { ...p, value, startable: value > 0 };
  });
  let total = 0;
  for (const period of periods) {
    const playing = opponents(stats, period);
    total += bestLineup(
      rated.filter((p) => playing.has(p.team)),
      slots,
      sport,
    ).total;
  }
  return total;
}
