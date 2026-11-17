/**
 * Playoff odds: the rest of the regular season played many times over, from
 * the league's own schedule (Sleeper's matchups, set for every week ahead)
 * and each team's strength in each week left (byes and game counts
 * included, weekStrength.ts). A team's weekly score is drawn around the
 * league's average weekly score scaled by its strength that week against the
 * league's average, half from its lineup and half from what it scored so
 * far, and by how far off that strength may be, drawn once per season; the spread is how much the league's own
 * weekly scores swung around each team's average. Standings go by wins (a
 * tie counts half), then points for, Sleeper's default tiebreaker. Division
 * winners are not seeded apart.
 */
import type { MatchupLevel } from "./matchup";

/** One team's score in one week, as Sleeper's matchups list it. */
export interface WeekScore {
  rid: number;
  /** The game it plays that week (two teams share one); null when it plays none. */
  matchupId: number | null;
  points: number;
}

export interface PlayoffTeam {
  rid: number;
  wins: number;
  losses: number;
  ties: number;
  /** Points for so far. */
  fpts: number;
  /** Its best lineup's points per game today (any scale shared by every team). */
  strength: number;
  /**
   * Its strength in each week left (any scale shared by every team and week),
   * when known: a week where every team has one uses it instead of `strength`.
   */
  weekly?: ReadonlyMap<number, number>;
}

export interface PlayoffInput {
  teams: readonly PlayoffTeam[];
  /** Every regular season week's matchups, by week. */
  weeks: ReadonlyMap<number, readonly WeekScore[]>;
  /** The last week with final scores: later weeks are simulated. */
  lastScored: number;
  /** The first playoff week: the regular season ends the week before. */
  playoffStart: number;
  playoffTeams: number;
  /** The league plays everyone against the week's median too (Sleeper's "league average match"). */
  medianGame: boolean;
  /**
   * How far off a team's strength may be, as a share of it (a standard
   * deviation, drawn once per season for each team; default STRENGTH_SPREAD).
   */
  strengthSpread?: number;
  /**
   * The share of a team's strength taken from its points per week so far,
   * the rest from its lineup (default ACTUAL_WEIGHT).
   */
  actualWeight?: number;
  /** Seasons played (default SIMULATIONS). */
  sims?: number;
  /** The random seed: the same input gives the same odds. */
  seed?: number;
}

export interface PlayoffOdds {
  rid: number;
  /** Its place in the standings today, from 1. */
  place: number;
  wins: number;
  losses: number;
  ties: number;
  /** Average wins and losses at the end of the regular season. */
  projWins: number;
  projLosses: number;
  /** Share of seasons it makes the playoffs, 0 to 1. */
  playoffs: number;
  /** Share of seasons it gets a first-round bye (0 when the bracket has none). */
  bye: number;
}

export interface PlayoffTable {
  /** In today's standings order. */
  rows: PlayoffOdds[];
  /** Regular season weeks still to play. */
  weeksLeft: number;
  /** First-round byes in the bracket (6 teams: the top 2). */
  byes: number;
}

export const SIMULATIONS = 10000;

/** The spread of a weekly score, as a share of the average, when too few weeks are known. */
export const DEFAULT_SPREAD = 0.18;

/**
 * How far off a team's strength may be: the model's view of a roster misses
 * what it does not see (who manages it, who breaks out, who gets hurt). Set
 * by checking past seasons' odds against what happened (ADR 0041).
 */
export const STRENGTH_SPREAD = 0.2;

/**
 * The share of a team's strength taken from what it scored so far: the
 * lineup misses what the model does not see, the points so far catch some of
 * it (checked on a past season, ADR 0041).
 */
export const ACTUAL_WEIGHT = 0.5;

/** Weeks with final scores needed before the league's own spread is used. */
const MIN_SPREAD_WEEKS = 3;

/** Each team's points per week so far, in the weeks it played. */
function pointsPerWeek(
  weeks: ReadonlyMap<number, readonly WeekScore[]>,
  lastScored: number,
): Map<number, number> {
  const sum = new Map<number, number>();
  const count = new Map<number, number>();
  for (const [week, scores] of weeks) {
    if (week > lastScored) continue;
    for (const s of scores) {
      if (s.matchupId === null || s.points <= 0) continue;
      sum.set(s.rid, (sum.get(s.rid) ?? 0) + s.points);
      count.set(s.rid, (count.get(s.rid) ?? 0) + 1);
    }
  }
  return new Map([...sum].map(([rid, total]) => [rid, total / count.get(rid)!]));
}

/**
 * Teams with their strength blended with what they scored so far: each
 * team's share of the league's average lineup and of its average points per
 * week, weighted, applied to its strength in every week (byes stay).
 */
export function blendActual(
  teams: readonly PlayoffTeam[],
  weeks: ReadonlyMap<number, readonly WeekScore[]>,
  lastScored: number,
  weight: number,
): PlayoffTeam[] {
  const ppw = pointsPerWeek(weeks, lastScored);
  const mean = (list: number[]) => list.reduce((s, v) => s + v, 0) / (list.length || 1);
  const meanStrength = mean(teams.map((t) => t.strength));
  const meanPoints = mean([...ppw.values()]);
  if (weight <= 0 || meanStrength <= 0 || meanPoints <= 0) return [...teams];
  return teams.map((t) => {
    const points = ppw.get(t.rid);
    if (points === undefined || t.strength <= 0) return t;
    const lineup = t.strength / meanStrength;
    const factor = ((1 - weight) * lineup + (weight * points) / meanPoints) / lineup;
    return {
      ...t,
      strength: t.strength * factor,
      weekly: t.weekly && new Map([...t.weekly].map(([w, v]) => [w, v * factor])),
    };
  });
}

/** Teams that skip the first round: up to the next power of two (6 teams: 2 byes). */
export function playoffByes(teams: number): number {
  if (teams < 2) return 0;
  const bracket = 2 ** Math.ceil(Math.log2(teams));
  return bracket - teams;
}

/** A small seeded random generator (mulberry32): the same seed, the same seasons. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A standard normal draw (Box-Muller). */
function normal(rand: () => number): number {
  const u = 1 - rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/**
 * The league's average weekly score and its spread: the standard deviation
 * of each team's weekly scores around its own average, pooled.
 */
export function scoringSpread(
  weeks: ReadonlyMap<number, readonly WeekScore[]>,
  lastScored: number,
): { average: number; spread: number } {
  const byTeam = new Map<number, number[]>();
  for (const [week, scores] of weeks) {
    if (week > lastScored) continue;
    for (const s of scores) {
      if (s.matchupId === null || s.points <= 0) continue;
      byTeam.set(s.rid, [...(byTeam.get(s.rid) ?? []), s.points]);
    }
  }
  const all = [...byTeam.values()].flat();
  const average = all.length ? all.reduce((s, v) => s + v, 0) / all.length : 0;
  let squares = 0;
  let freedom = 0;
  for (const list of byTeam.values()) {
    if (list.length < 2) continue;
    const mean = list.reduce((s, v) => s + v, 0) / list.length;
    squares += list.reduce((s, v) => s + (v - mean) ** 2, 0);
    freedom += list.length - 1;
  }
  const weeksKnown = Math.max(0, ...[...byTeam.values()].map((l) => l.length));
  const spread =
    weeksKnown >= MIN_SPREAD_WEEKS && freedom > 0
      ? Math.sqrt(squares / freedom)
      : DEFAULT_SPREAD * average;
  return { average, spread };
}

export function playoffOdds(input: PlayoffInput): PlayoffTable {
  const { weeks, lastScored, playoffStart, playoffTeams, medianGame } = input;
  const teams = blendActual(input.teams, weeks, lastScored, input.actualWeight ?? ACTUAL_WEIGHT);
  const sims = input.sims ?? SIMULATIONS;
  const strengthSpread = input.strengthSpread ?? STRENGTH_SPREAD;
  const rand = random(input.seed ?? 1);
  const byes = Math.min(playoffByes(playoffTeams), playoffTeams);
  const left = [...weeks.keys()]
    .filter((w) => w > lastScored && w < playoffStart)
    .sort((a, b) => a - b);

  const { average, spread } = scoringSpread(weeks, lastScored);
  const meanStrength = teams.reduce((s, t) => s + t.strength, 0) / (teams.length || 1);
  // Weeks where every team has its own strength, and their average over all of them:
  // a weak week for one team (a bye) lowers its score, not everyone's.
  const known = left.filter((w) => teams.every((t) => t.weekly?.has(w)));
  const knownAll = known.flatMap((w) => teams.map((t) => t.weekly!.get(w)!));
  const meanWeekly = knownAll.reduce((s, v) => s + v, 0) / (knownAll.length || 1);
  const scaled = (strength: number, mean: number) =>
    mean > 0 ? (average * strength) / mean : average;
  // Each week's expected score, by team index.
  const expected = left.map((w) =>
    teams.map((t) =>
      known.includes(w) ? scaled(t.weekly!.get(w)!, meanWeekly) : scaled(t.strength, meanStrength),
    ),
  );
  // Each week's games: pairs of teams sharing a matchup id.
  const games = left.map((w) => {
    const byId = new Map<number, number[]>();
    for (const s of weeks.get(w) ?? []) {
      if (s.matchupId !== null) byId.set(s.matchupId, [...(byId.get(s.matchupId) ?? []), s.rid]);
    }
    return [...byId.values()].filter((pair) => pair.length === 2) as [number, number][];
  });

  const index = new Map(teams.map((t, i) => [t.rid, i]));
  const n = teams.length;
  const madeIt = new Array<number>(n).fill(0);
  const gotBye = new Array<number>(n).fill(0);
  const winsSum = new Array<number>(n).fill(0);
  const lossesSum = new Array<number>(n).fill(0);
  const wins = new Array<number>(n);
  const losses = new Array<number>(n);
  const points = new Array<number>(n);
  const score = new Array<number>(n);
  const order = teams.map((_, i) => i);
  const form = new Array<number>(n);

  for (let sim = 0; sim < sims; sim++) {
    teams.forEach((t, i) => {
      wins[i] = t.wins + t.ties / 2;
      losses[i] = t.losses + t.ties / 2;
      points[i] = t.fpts;
      form[i] = Math.max(0, 1 + strengthSpread * normal(rand));
    });
    for (const [k, week] of games.entries()) {
      teams.forEach((_, i) => {
        score[i] = expected[k]![i]! * form[i]! + spread * normal(rand);
        points[i]! += score[i]!;
      });
      for (const [a, b] of week) {
        const i = index.get(a);
        const j = index.get(b);
        if (i === undefined || j === undefined) continue;
        const [w, l] = score[i]! >= score[j]! ? [i, j] : [j, i];
        wins[w]! += 1;
        losses[l]! += 1;
      }
      if (medianGame) {
        const sorted = [...score].sort((x, y) => y - x);
        const median = (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.ceil((n - 1) / 2)]!) / 2;
        for (let i = 0; i < n; i++) {
          if (score[i]! > median) wins[i]! += 1;
          else losses[i]! += 1;
        }
      }
    }
    order.sort((x, y) => wins[y]! - wins[x]! || points[y]! - points[x]!);
    order.forEach((i, place) => {
      if (place < playoffTeams) madeIt[i]! += 1;
      if (place < byes) gotBye[i]! += 1;
    });
    for (let i = 0; i < n; i++) {
      winsSum[i]! += wins[i]!;
      lossesSum[i]! += losses[i]!;
    }
  }

  // Today's standings, by the same rule as the simulated ones: wins (a tie
  // counts half), then points for.
  const standing = teams
    .map((_, i) => i)
    .sort(
      (x, y) =>
        teams[y]!.wins + teams[y]!.ties / 2 - (teams[x]!.wins + teams[x]!.ties / 2) ||
        teams[y]!.fpts - teams[x]!.fpts ||
        teams[x]!.rid - teams[y]!.rid,
    );
  const rows = standing.map((i, place) => {
    const t = teams[i]!;
    return {
      rid: t.rid,
      place: place + 1,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      projWins: winsSum[i]! / sims,
      projLosses: lossesSum[i]! / sims,
      playoffs: madeIt[i]! / sims,
      bye: gotBye[i]! / sims,
    };
  });
  return { rows, weeksLeft: left.length, byes };
}

/**
 * The odds in the matchup labels' five levels: great when nearly sure
 * (90% or more), brutal when nearly out (10% or less).
 */
export function oddsLevel(p: number): MatchupLevel {
  if (p >= 0.9) return "great";
  if (p >= 0.6) return "good";
  if (p > 0.4) return "neutral";
  if (p > 0.1) return "tough";
  return "brutal";
}

/** "87%", or "<1%" / ">99%" when close to sure but not quite. */
export function oddsText(p: number): string {
  if (p > 0 && p < 0.01) return "<1%";
  if (p < 1 && p > 0.99) return ">99%";
  return `${Math.round(p * 100)}%`;
}

/**
 * A projected record in whole games, "6-8": wins rounded, losses the rest of
 * the season's games, so the two always add up.
 */
export function projectedRecord(projWins: number, projLosses: number): string {
  const wins = Math.round(projWins);
  return `${wins}-${Math.round(projWins + projLosses) - wins}`;
}
