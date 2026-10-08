import type { ModelParams, SportConfig } from "../sports/types";
import { lineupPeriods } from "./periods";
import { replacementLevels } from "./replacement";
import { average, makeScorer } from "./scoring";
import type { LeagueSettings, Model, PackedStats, Player, StatsFile } from "./types";
import { expectedPoints, fitPointsPerOpportunity, USAGE_KEYS, type UsageSample } from "./usage";
import {
  absentKeyTeammate,
  formWithReturn,
  lastTeamWeek,
  OFFENSE,
  type RosterView,
} from "./teammates";
import { estimate, priorPpg } from "./value";

/** Games in an NFL regular season, when the stats file does not say. */
const DEFAULT_SEASON_GAMES = 17;

/** The league's lineup slots that the model can fill (bench, IR and IDP slots are dropped). */
export function modelSlots(league: LeagueSettings, sport: SportConfig): string[] {
  return (league.roster_positions ?? []).filter((s) => s in sport.slotEligibility);
}

/** The draft-ADP format closest to the league: superflex/2QB, then points per reception. */
export function adpFormat(league: LeagueSettings, slots: readonly string[]): string {
  if (slots.filter((s) => s === "QB" || s === "SUPER_FLEX").length >= 2) return "2qb";
  const rec = league.scoring_settings?.rec ?? 0;
  return rec >= 0.75 ? "ppr" : rec >= 0.25 ? "half" : "std";
}

/** Targets, carries and red-zone targets of one game, in USAGE_KEYS order. */
function makeOpportunityReader(keys: readonly string[]) {
  const index = new Map(USAGE_KEYS.map((k, i) => [keys.indexOf(k), i]));
  return (packed: PackedStats): number[] => {
    const x = USAGE_KEYS.map(() => 0);
    for (let i = 0; i + 1 < packed.length; i += 2) {
      const slot = index.get(packed[i]!);
      if (slot !== undefined) x[slot] = packed[i + 1]!;
    }
    return x;
  };
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

interface Games {
  pts: number[];
  opportunities: number[][];
  weeks: number[];
}

/**
 * The per-game points that feed a player's value: big outliers capped at a
 * multiple of the player's usual output, then blended with the points his
 * targets and carries usually produce. Displayed averages stay the real ones.
 */
function formGames(
  games: Games,
  prevPpg: number | null,
  prevG: number,
  coef: readonly number[] | null,
  params: ModelParams,
): number[] {
  const usual = prevG >= params.prevFullGames && prevPpg !== null ? prevPpg : median(games.pts);
  const cap =
    params.outlierCap > 0 && usual !== null && (prevG > 0 || games.pts.length >= 2)
      ? params.outlierCap * Math.max(usual, 1)
      : Infinity;
  return games.pts.map((pts, i) => {
    const capped = Math.min(pts, cap);
    if (!coef || params.usageBlend <= 0) return capped;
    const expected = expectedPoints(coef, games.opportunities[i] ?? []);
    return (1 - params.usageBlend) * capped + params.usageBlend * expected;
  });
}

/** Scores every player under the league's rules, then values them against replacement level. */
export function buildModel(stats: StatsFile, league: LeagueSettings, sport: SportConfig): Model {
  const params = sport.model;
  const score = makeScorer(stats.keys, league.scoring_settings);
  const readOpportunities = makeOpportunityReader(stats.keys);
  const supported = (x: string | undefined): x is string =>
    x !== undefined && sport.positions.includes(x);

  // The next game: the lineup week's first projected game after every period played so far.
  const lastPlayed = Math.max(0, ...stats.weeks);
  const upcoming = lineupPeriods(stats).filter((period) => period > lastPlayed);

  // Preseason projections: season totals (divided by the season's games) or per game already.
  const projGames = stats.proj_per_game ? 1 : (stats.season_games ?? DEFAULT_SEASON_GAMES);

  const players: Record<string, Player> = {};
  const games = new Map<string, Games>();
  for (const [id, p] of Object.entries(stats.players)) {
    const elig = (p.fp?.length ? p.fp : [p.p]).filter(supported);
    const pos = supported(p.p) ? p.p : elig[0];
    if (!pos) continue;

    const played: Games = { pts: [], opportunities: [], weeks: [] };
    const weekly = stats.weeks.map((week) => {
      const packed = p.w?.[week];
      if (!packed) return { week, pts: null };
      const pts = score(packed);
      played.pts.push(pts);
      played.opportunities.push(readOpportunities(packed));
      played.weeks.push(week);
      return { week, pts };
    });
    games.set(id, played);
    const prevG = p.prev ? p.prev.g : 0;
    const nextGame = upcoming.map((period) => p.wp?.[String(period)]).find(Boolean);
    players[id] = {
      id,
      name: p.n || `Player ${id}`,
      pos,
      elig: elig.length ? elig : [pos],
      team: p.t || "",
      noTeam: !p.t,
      age: p.a,
      inj: p.i || null,
      status: p.s || null,
      weekly,
      g: played.pts.length,
      seasonAvg: average(played.pts),
      lastAvg: average(played.pts.slice(-params.recentGames)),
      prevG,
      prevPpg: prevG && p.prev ? score(p.prev.s) / prevG : null,
      projPpg: p.proj ? score(p.proj) / projGames : null,
      nextGamePpg: nextGame ? score(nextGame) : null,
      value: 0,
      vorp: 0,
      startable: true,
      injMult: 1,
      weights: { prev: 0, season: 0, recent: 0, repl: 0 },
      context: null,
    };
  }

  const list = Object.values(players);

  // What an opportunity is worth at each position, under this league's scoring.
  const coefByPos = new Map<string, number[] | null>();
  if (params.usageBlend > 0) {
    for (const pos of params.usagePositions) {
      const samples: UsageSample[] = [];
      for (const pl of list) {
        if (pl.pos !== pos) continue;
        const g = games.get(pl.id)!;
        g.pts.forEach((y, i) => samples.push({ x: g.opportunities[i]!, y }));
      }
      coefByPos.set(pos, fitPointsPerOpportunity(samples));
    }
  }

  // Offense by current team, to find key teammates who are out.
  const views = new Map<string, RosterView>();
  const byTeam = new Map<string, RosterView[]>();
  if (params.teammateReturn > 0) {
    for (const pl of list) {
      if (!(OFFENSE as readonly string[]).includes(pl.pos) || !pl.team) continue;
      const view: RosterView = {
        id: pl.id,
        name: pl.name,
        pos: pl.pos,
        team: pl.team,
        inj: pl.inj,
        prior: priorPpg(pl, params),
        teamByWeek: stats.players[pl.id]?.tw ?? {},
      };
      views.set(pl.id, view);
      byTeam.set(pl.team, [...(byTeam.get(pl.team) ?? []), view]);
    }
  }
  const lastWeekByTeam = lastTeamWeek([...views.values()]);

  // Inputs to the value estimate: form averages built from adjusted games.
  const inputs = new Map(
    list.map((pl) => {
      const g = games.get(pl.id)!;
      const form = formGames(g, pl.prevPpg, pl.prevG, coefByPos.get(pl.pos) ?? null, params);
      let seasonAvg = average(form);
      let lastAvg = average(form.slice(-params.recentGames));
      const view = views.get(pl.id);
      const absent = view
        ? absentKeyTeammate(view, byTeam.get(pl.team) ?? [], lastWeekByTeam.get(pl.team), params)
        : null;
      if (absent && form.length) {
        const mixed = formWithReturn(
          form,
          g.weeks,
          views.get(absent.id)!,
          pl.team,
          absent.returnChance,
          priorPpg(pl, params),
          params.recentGames,
        );
        if (mixed) {
          ({ seasonAvg, lastAvg } = mixed);
          pl.context = { teammate: absent.name, returnChance: absent.returnChance };
        }
      }
      return [pl.id, { ...pl, seasonAvg, lastAvg }] as const;
    }),
  );

  const slots = modelSlots(league, sport);
  const teams = league.total_rosters || league.settings?.num_teams || sport.defaultTeams;

  // Two passes: replacement level depends on values, and rookies' values
  // depend on replacement level.
  for (const pl of list) Object.assign(pl, estimate(inputs.get(pl.id)!, null, params));
  let repl = replacementLevels(list, slots, teams, sport);
  for (const pl of list) Object.assign(pl, estimate(inputs.get(pl.id)!, repl, params));
  repl = replacementLevels(list, slots, teams, sport);
  for (const pl of list) pl.vorp = Math.max(0, pl.value - (repl[pl.pos] ?? 0));

  return { players, repl, slots, teams, adpFormat: adpFormat(league, slots) };
}

/**
 * The model's players on a roster, skipping positions the model does not value.
 * With the roster's injured reserve slots (`reserveIds`), the players in them
 * and the ones on IR outside them are marked (`irSlot`).
 */
export function rosterPlayers(
  model: Model,
  playerIds: readonly string[],
  reserveIds?: readonly string[] | null,
): Player[] {
  const reserve = reserveIds ? new Set(reserveIds) : null;
  return playerIds.flatMap((id) => {
    const p = model.players[id];
    if (!p) return [];
    if (!reserve) return [p];
    if (reserve.has(id)) return [{ ...p, irSlot: true }];
    return [p.inj === "IR" ? { ...p, irSlot: false } : p];
  });
}
