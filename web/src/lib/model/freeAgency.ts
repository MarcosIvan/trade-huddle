/**
 * The free agency list: the league's unrostered players at a position, with
 * their season stats or their projection for the week ahead, like Sleeper's
 * player list (ADR 0029).
 */
import { lineupPeriods } from "./periods";
import type { Scorer } from "./scoring";
import type { Model, PackedStats, Player, StatsFile } from "./types";
import { opponents } from "./weekly";

/** A game ahead: the opponent's team code and where it is played. */
export interface GameAhead {
  opponent: string;
  home: boolean;
}

/** What the list shows: this season's stats or the projection for the week to set a lineup for. */
export type FreeAgentData = "stats" | "projections";

/** What the list ranks by: trade value or fantasy points (season or projected). */
export type FreeAgentSort = "value" | "points";

export interface FreeAgentRow {
  player: Player;
  /** Trade value. */
  value: number;
  /** Fantasy points this season, or projected for the week. */
  points: number;
  /** Games played this season, or games projected for the week. */
  games: number;
  /** Points per game played this season, or per projected game; null without games. */
  ppg: number | null;
  /** Stat totals by stats-file key (season, or projected for the week). */
  stats: Readonly<Record<string, number>>;
  /** The projections view: his team's games in the periods projected (none in the stats view). */
  matchups: readonly GameAhead[];
}

/** Players per page of the list. */
export const FREE_AGENT_PAGE = 25;

/**
 * Whether an unrostered player belongs on the list: on a team and with
 * something to show (games this season or last, or a projection).
 */
export const listable = (p: Player): boolean =>
  !p.noTeam && (p.g > 0 || p.prevG > 0 || p.projPpg !== null || p.nextGamePpg !== null);

/** Adds packed stats into totals. */
function addPacked(stats: StatsFile, totals: Record<string, number>, packed: PackedStats): void {
  for (let i = 0; i + 1 < packed.length; i += 2) {
    const key = stats.keys[packed[i]!];
    if (key) totals[key] = (totals[key] ?? 0) + packed[i + 1]!;
  }
}

/**
 * The periods of the week ahead still to play: the lineup week's periods
 * after the last one played (in the NBA, the game days left in the week).
 */
export function projectedPeriods(stats: StatsFile): number[] {
  const lastPlayed = Math.max(0, ...stats.weeks);
  return lineupPeriods(stats).filter((period) => period > lastPlayed);
}

/**
 * The league's free agents at a position: everyone on no roster who is
 * `listable`, with season stats or the week's projection under the league's
 * scoring, ranked by trade value or fantasy points (ties go to the other).
 */
export function freeAgentRows(
  model: Model,
  stats: StatsFile,
  score: Scorer,
  rostered: ReadonlySet<string>,
  pos: string,
  data: FreeAgentData,
  by: FreeAgentSort,
  worth: (p: Player) => number,
): FreeAgentRow[] {
  const periods = data === "projections" ? projectedPeriods(stats) : stats.weeks;
  const source = data === "projections" ? "wp" : "w";
  // Each projected period's games, by team.
  const schedule = data === "projections" ? periods.map((period) => opponents(stats, period)) : [];
  const key = (r: FreeAgentRow) => (by === "value" ? [r.value, r.points] : [r.points, r.value]);
  return Object.values(model.players)
    .filter((p) => p.pos === pos && !rostered.has(p.id) && listable(p))
    .map((p) => {
      const sp = stats.players[p.id];
      const totals: Record<string, number> = {};
      let points = 0;
      let games = 0;
      for (const period of periods) {
        const packed = sp?.[source]?.[String(period)];
        if (!packed) continue;
        games += 1;
        points += score(packed);
        addPacked(stats, totals, packed);
      }
      return {
        player: p,
        value: worth(p),
        points,
        games,
        ppg: games > 0 ? points / games : null,
        stats: totals,
        matchups:
          data === "projections" ? schedule.flatMap((byTeam) => byTeam.get(p.team) ?? []) : [],
      };
    })
    .sort((a, b) => {
      const [a1, a2] = key(a);
      const [b1, b2] = key(b);
      return b1! - a1! || b2! - a2! || a.player.name.localeCompare(b.player.name);
    });
}

/** Pages a list holds (at least one, so an empty list still shows its first page). */
export const pageCount = (total: number, size = FREE_AGENT_PAGE): number =>
  Math.max(1, Math.ceil(total / size));

/** One page of a list, counted from 1; a page past the end shows the last one. */
export function pageOf<T>(list: readonly T[], page: number, size = FREE_AGENT_PAGE): T[] {
  const last = pageCount(list.length, size);
  const at = Math.min(Math.max(1, Math.floor(page)), last);
  return list.slice((at - 1) * size, at * size);
}
