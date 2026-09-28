/**
 * Teammates returning from absence. While a star is out, his teammates get his
 * targets and carries; when he returns, they lose them. A player's recent form
 * is therefore split into games with and without the absent teammate, and the
 * rest of the season is expected to look like a mix of both, weighted by the
 * chance that the teammate plays.
 */
import type { ModelParams } from "../sports/types";
import { average } from "./scoring";

/** Positions whose absence moves teammates' volume, and who are affected by it. */
export const OFFENSE = ["QB", "RB", "WR", "TE"] as const;

export interface RosterView {
  id: string;
  name: string;
  pos: string;
  /** Current NFL team. */
  team: string;
  inj: string | null;
  /** Prior points per game (projection or last season). */
  prior: number | null;
  /** Team played for, by week. */
  teamByWeek: Readonly<Record<string, string>>;
}

export interface AbsentTeammate {
  id: string;
  name: string;
  /** Share of the remaining games he is expected to play. */
  returnChance: number;
}

/**
 * Injury-report statuses that mean "out for now, expected back". A missing
 * player without one of these (cut, benched, traded, season over) is not
 * expected to return.
 */
const RETURNING = new Set(["Questionable", "Doubtful", "Out", "IR", "PUP", "NA", "Sus"]);

/** Statuses that mean a longer absence than a week or two. */
const LONG_ABSENCE = new Set(["IR", "PUP", "NA"]);

function returnChance(inj: string | null, params: ModelParams): number {
  return LONG_ABSENCE.has(inj ?? "") ? params.teammateReturn * 0.6 : params.teammateReturn;
}

/** The last week each team played, from who played for whom. */
export function lastTeamWeek(players: readonly RosterView[]): Map<string, number> {
  const last = new Map<string, number>();
  for (const p of players) {
    for (const [week, team] of Object.entries(p.teamByWeek)) {
      const w = Number(week);
      if (w > (last.get(team) ?? 0)) last.set(team, w);
    }
  }
  return last;
}

/**
 * The most important teammate who missed the team's last game while this
 * player played it, if he is expected back. Returns null when nothing applies.
 */
export function absentKeyTeammate(
  player: RosterView,
  teammates: readonly RosterView[],
  lastWeek: number | undefined,
  params: ModelParams,
): AbsentTeammate | null {
  if (params.teammateReturn <= 0 || !lastWeek || !player.team) return null;
  if (player.teamByWeek[String(lastWeek)] !== player.team) return null;
  let best: RosterView | null = null;
  for (const t of teammates) {
    if (t.id === player.id || t.team !== player.team) continue;
    if (!(OFFENSE as readonly string[]).includes(t.pos)) continue;
    if ((t.prior ?? 0) < params.keyTeammatePpg) continue;
    if (t.teamByWeek[String(lastWeek)] === player.team) continue; // he played
    if (!RETURNING.has(t.inj ?? "")) continue; // not expected back
    if (!best || (t.prior ?? 0) > (best.prior ?? 0)) best = t;
  }
  return best
    ? { id: best.id, name: best.name, returnChance: returnChance(best.inj, params) }
    : null;
}

/**
 * Form averages for the rest of the season: a mix of the player's games with
 * the teammate (or his prior, when they have not played together yet) and
 * without him.
 */
export function formWithReturn(
  form: readonly number[],
  weeks: readonly number[],
  teammate: RosterView,
  team: string,
  chance: number,
  prior: number | null,
  recentGames: number,
): { seasonAvg: number | null; lastAvg: number | null } | null {
  const withHim: number[] = [];
  const without: number[] = [];
  form.forEach((pts, i) =>
    (teammate.teamByWeek[String(weeks[i])] === team ? withHim : without).push(pts),
  );
  const withAvg = average(withHim) ?? prior;
  const withoutAvg = average(without);
  if (withAvg === null || withoutAvg === null) return null;
  const lastAvg = average(form.slice(-recentGames)) ?? withoutAvg;
  return {
    seasonAvg: chance * withAvg + (1 - chance) * withoutAvg,
    lastAvg: chance * withAvg + (1 - chance) * lastAvg,
  };
}
