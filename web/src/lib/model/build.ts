import type { ModelParams, SportConfig } from "../sports/types";
import { replacementLevels } from "./replacement";
import { average, makeScorer } from "./scoring";
import type { LeagueSettings, Model, PackedStats, Player, StatsFile } from "./types";
import { expectedPoints, fitPointsPerOpportunity, USAGE_KEYS, type UsageSample } from "./usage";
import { estimate } from "./value";

/** Games in an NFL regular season, when the stats file does not say. */
const DEFAULT_SEASON_GAMES = 17;

/** The league's lineup slots that the model can fill (bench, IR and IDP slots are dropped). */
export function modelSlots(league: LeagueSettings, sport: SportConfig): string[] {
  return (league.roster_positions ?? []).filter((s) => s in sport.slotEligibility);
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

  const players: Record<string, Player> = {};
  const games = new Map<string, Games>();
  for (const [id, p] of Object.entries(stats.players)) {
    const elig = (p.fp?.length ? p.fp : [p.p]).filter(supported);
    const pos = supported(p.p) ? p.p : elig[0];
    if (!pos) continue;

    const played: Games = { pts: [], opportunities: [] };
    const weekly = stats.weeks.map((week) => {
      const packed = p.w?.[week];
      if (!packed) return { week, pts: null };
      const pts = score(packed);
      played.pts.push(pts);
      played.opportunities.push(readOpportunities(packed));
      return { week, pts };
    });
    games.set(id, played);
    const prevG = p.prev ? p.prev.g : 0;
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
      projPpg: p.proj ? score(p.proj) / (stats.season_games ?? DEFAULT_SEASON_GAMES) : null,
      value: 0,
      vorp: 0,
      startable: true,
      injMult: 1,
      weights: { prev: 0, season: 0, recent: 0, repl: 0 },
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

  // Inputs to the value estimate: form averages built from adjusted games.
  const inputs = new Map(
    list.map((pl) => {
      const form = formGames(
        games.get(pl.id)!,
        pl.prevPpg,
        pl.prevG,
        coefByPos.get(pl.pos) ?? null,
        params,
      );
      return [
        pl.id,
        { ...pl, seasonAvg: average(form), lastAvg: average(form.slice(-params.recentGames)) },
      ] as const;
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

  return { players, repl, slots, teams };
}

/** The model's players on a roster, skipping positions the model does not value. */
export function rosterPlayers(model: Model, playerIds: readonly string[]): Player[] {
  return playerIds.flatMap((id) => {
    const p = model.players[id];
    return p ? [p] : [];
  });
}
