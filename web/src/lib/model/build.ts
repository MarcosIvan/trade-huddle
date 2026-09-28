import type { SportConfig } from "../sports/types";
import { replacementLevels } from "./replacement";
import { average, makeScorer } from "./scoring";
import type { LeagueSettings, Model, Player, StatsFile } from "./types";
import { estimate } from "./value";

/** The league's lineup slots that the model can fill (bench, IR and IDP slots are dropped). */
export function modelSlots(league: LeagueSettings, sport: SportConfig): string[] {
  return (league.roster_positions ?? []).filter((s) => s in sport.slotEligibility);
}

/** Scores every player under the league's rules, then values them against replacement level. */
export function buildModel(stats: StatsFile, league: LeagueSettings, sport: SportConfig): Model {
  const params = sport.model;
  const score = makeScorer(stats.keys, league.scoring_settings);
  const supported = (x: string | undefined): x is string =>
    x !== undefined && sport.positions.includes(x);

  const players: Record<string, Player> = {};
  for (const [id, p] of Object.entries(stats.players)) {
    const elig = (p.fp?.length ? p.fp : [p.p]).filter(supported);
    const pos = supported(p.p) ? p.p : elig[0];
    if (!pos) continue;

    const weekly = stats.weeks.map((week) => {
      const packed = p.w?.[week];
      return { week, pts: packed ? score(packed) : null };
    });
    const played = weekly.flatMap((x) => (x.pts === null ? [] : [x.pts]));
    const prevG = p.prev ? p.prev.g : 0;
    players[id] = {
      id,
      name: p.n || `Player ${id}`,
      pos,
      elig: elig.length ? elig : [pos],
      team: p.t || "",
      age: p.a,
      inj: p.i || null,
      status: p.s || null,
      weekly,
      g: played.length,
      seasonAvg: average(played),
      lastAvg: average(played.slice(-params.recentGames)),
      prevG,
      prevPpg: prevG && p.prev ? score(p.prev.s) / prevG : null,
      value: 0,
      vorp: 0,
      startable: true,
      injMult: 1,
      weights: { prev: 0, season: 0, recent: 0, repl: 0 },
    };
  }

  const list = Object.values(players);
  const slots = modelSlots(league, sport);
  const teams = league.total_rosters || league.settings?.num_teams || sport.defaultTeams;

  // Two passes: replacement level depends on values, and rookies' values
  // depend on replacement level.
  for (const pl of list) Object.assign(pl, estimate(pl, null, params));
  let repl = replacementLevels(list, slots, teams, sport);
  for (const pl of list) Object.assign(pl, estimate(pl, repl, params));
  repl = replacementLevels(list, slots, teams, sport);
  for (const pl of list) pl.vorp = Math.max(0, pl.value - (repl[pl.pos] ?? 0));

  return { players, repl, slots, teams };
}

/** The model's players on a roster, skipping positions the model does not value. */
export function rosterPlayers(model: Model, playerIds: readonly string[]): Player[] {
  return playerIds.flatMap((id) => {
    const p = model.players[id];
    return p ? [p] : [];
  });
}
