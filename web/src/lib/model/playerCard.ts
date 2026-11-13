/**
 * What the player card shows: each game this season (points and stat line)
 * and the games left, each rated by how much its defense allows to the
 * player's position.
 */
import type { SportConfig, StatColumn } from "../sports/types";
import type { MatchupRating, MatchupRatings } from "./matchup";
import { currentPeriod } from "./periods";
import { starterLine } from "./trades";
import type { Model, Player, StatsFile } from "./types";
import { opponents } from "./weekly";

export type { DefenseFactors } from "./matchup";

export interface CardGame {
  week: number;
  /** Opponent's team code; null on a bye or when the schedule is unknown. */
  opponent: string | null;
  home: boolean;
  bye: boolean;
  /** Fantasy points; null when the player did not play (or the game is still to come). */
  pts: number | null;
  /** Stat line by stats-file key; empty when he did not play. */
  stats: Readonly<Record<string, number>>;
  /** The opponent's rank and label for the position (matchupRatings); null when unknown. */
  rating: MatchupRating | null;
}

export interface PlayerCard {
  /** Weeks played so far this season, in order (did-not-play weeks included). */
  games: CardGame[];
  /** Games left on the schedule, in order (byes included). */
  upcoming: CardGame[];
  /** Season totals of every stat. */
  totals: Readonly<Record<string, number>>;
  /** Season fantasy points and games played. */
  pts: number;
  played: number;
}

function unpack(stats: StatsFile, packed: readonly number[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!packed) return out;
  for (let i = 0; i + 1 < packed.length; i += 2) {
    const key = stats.keys[packed[i]!];
    if (key) out[key] = packed[i + 1]!;
  }
  return out;
}

/**
 * Every stat column of a position's game log: its playing time first, when
 * the position has a game log, then its stat groups.
 */
export function cardColumns(pos: string, sport: SportConfig): StatColumn[] {
  const groups = sport.gameLog[pos] ?? [];
  if (!groups.length) return [];
  const time = sport.playingTime ? [sport.playingTime] : [];
  return [...time, ...groups.flatMap((g) => g.columns)];
}

/**
 * A column's number from a stat line (one game's, the season's totals or a
 * position's averages): the stat itself (times its `scale`), or its share of
 * `per` (undefined when `per` is missing, as for a player with no snap counts).
 */
export function columnValue(
  column: StatColumn,
  line: Readonly<Record<string, number>>,
): number | undefined {
  if (!column.per) {
    const x = line[column.key];
    return x === undefined ? undefined : x * (column.scale ?? 1);
  }
  const of = line[column.per];
  return of ? (line[column.key] ?? 0) / of : undefined;
}

/** The player's season game by game and the games he has left. */
export function playerCard(
  player: Player,
  stats: StatsFile,
  ratings: MatchupRatings,
  sport: SportConfig,
): PlayerCard {
  const sp = stats.players[player.id];
  const shown = new Set(cardColumns(player.pos, sport).flatMap((c) => [c.key, c.per ?? c.key]));
  const game = (week: number, team: string, pts: number | null, packed?: readonly number[]) => {
    const scheduled = stats.schedule?.[String(week)] !== undefined;
    const g = team ? opponents(stats, week).get(team) : undefined;
    const rating = g ? (ratings.get(g.opponent)?.get(player.pos) ?? null) : null;
    const line = unpack(stats, packed);
    return {
      week,
      opponent: g?.opponent ?? null,
      home: g?.home ?? false,
      bye: Boolean(team) && scheduled && !g,
      pts,
      stats: Object.fromEntries(Object.entries(line).filter(([k]) => shown.has(k))),
      rating,
    };
  };

  // The week to set a lineup for may be under way: a game already played there counts as
  // played, one still to come as upcoming.
  const current = currentPeriod(stats);
  const games = player.weekly
    .filter((w) => w.week < current || w.pts !== null)
    .map((w) =>
      game(w.week, sp?.tw?.[String(w.week)] ?? player.team, w.pts, sp?.w?.[String(w.week)]),
    );
  const done = new Set(games.map((g) => g.week));
  const weeks = Object.keys(stats.schedule ?? {})
    .map(Number)
    .filter((w) => w >= current && !done.has(w))
    .sort((a, b) => a - b);
  const upcoming = player.noTeam ? [] : weeks.map((w) => game(w, player.team, null));
  // By game day (the NBA), a day his team does not play is no row at all, not a bye.
  if (stats.period === "day") {
    const playing = (g: CardGame) => !g.bye;
    return summary(games.filter(playing), upcoming.filter(playing));
  }
  return summary(games, upcoming);
}

/** The card's rows with the season totals, fantasy points and games played. */
function summary(games: CardGame[], upcoming: CardGame[]): PlayerCard {
  const totals: Record<string, number> = {};
  for (const g of games) {
    for (const [k, v] of Object.entries(g.stats)) totals[k] = (totals[k] ?? 0) + v;
  }
  const played = games.filter((g) => g.pts !== null);
  return {
    games,
    upcoming,
    totals,
    pts: played.reduce((s, g) => s + (g.pts ?? 0), 0),
    played: played.length,
  };
}

/** Where a player's season fantasy points rank: at his position and among every player. */
export interface SeasonRank {
  pos: number;
  overall: number;
}

/**
 * Every player's rank by season fantasy points under the league's scoring, at
 * his position and overall (1 = most points; ties share a rank). Players who
 * have not played this season get no rank.
 */
export function seasonRanks(model: Model): ReadonlyMap<string, SeasonRank> {
  const scored = Object.values(model.players)
    .filter((p) => p.g > 0)
    .map((p) => ({ p, pts: p.weekly.reduce((s, w) => s + (w.pts ?? 0), 0) }))
    .sort((a, b) => b.pts - a.pts);
  const ranks = new Map<string, SeasonRank>();
  const seen = new Map<string, { count: number; rank: number; pts: number }>();
  let overall = 0;
  scored.forEach(({ p, pts }, i) => {
    if (i === 0 || pts < scored[i - 1]!.pts) overall = i + 1;
    const at = seen.get(p.pos) ?? { count: 0, rank: 0, pts: Infinity };
    at.count += 1;
    if (pts < at.pts) at.rank = at.count;
    at.pts = pts;
    seen.set(p.pos, at);
    ranks.set(p.id, { pos: at.rank, overall });
  });
  return ranks;
}

/** How one game's number compares with what the position usually does (statBenchmarks). */
export type StatLevel = "good" | "neutral" | "bad";

/** A game at least this share above (or below) the position's average is good (or bad). */
export const STAT_EDGE = 0.15;

/** Key for fantasy points in the benchmarks. */
// Not "pts": that is the NBA's points stat, a key of the stats file.
export const PTS_KEY = "fantasy_pts";

/** Per-game averages by position and stat key (PTS_KEY for fantasy points). */
export type StatBenchmarks = ReadonlyMap<string, Readonly<Record<string, number>>>;

/** The benchmark group: the league's starters at a position times this (2: starters and backups). */
export const BENCHMARK_DEPTH = 2;

/**
 * What a rosterable player does per game at each position: the average over
 * this season's games and last season's of every player at or above the
 * line of BENCHMARK_DEPTH times the league's starters there (trades'
 * starterLine). Last season makes the sample large enough early on and keeps
 * this season's hot starts from setting the bar.
 */
export function statBenchmarks(model: Model, stats: StatsFile, sport: SportConfig): StatBenchmarks {
  const line = starterLine(model, sport, BENCHMARK_DEPTH);
  const sums = new Map<string, { games: number; totals: Record<string, number> }>();
  const add = (acc: { totals: Record<string, number> }, line: Record<string, number>) => {
    for (const [k, v] of Object.entries(line)) acc.totals[k] = (acc.totals[k] ?? 0) + v;
  };
  for (const p of Object.values(model.players)) {
    const cut = line[p.pos];
    if (cut === undefined || p.value < cut) continue;
    const acc = sums.get(p.pos) ?? { games: 0, totals: {} };
    for (const w of p.weekly) {
      if (w.pts === null) continue;
      acc.games += 1;
      add(acc, { [PTS_KEY]: w.pts, ...unpack(stats, stats.players[p.id]?.w?.[String(w.week)]) });
    }
    const prev = stats.players[p.id]?.prev;
    if (prev && prev.g > 0 && p.prevPpg !== null) {
      acc.games += prev.g;
      add(acc, { [PTS_KEY]: p.prevPpg * prev.g, ...unpack(stats, prev.s) });
    }
    sums.set(p.pos, acc);
  }
  return new Map(
    [...sums]
      .filter(([, a]) => a.games > 0)
      .map(([pos, a]) => [
        pos,
        Object.fromEntries(Object.entries(a.totals).map(([k, v]) => [k, v / a.games])),
      ]),
  );
}

/**
 * Good, neutral or bad against the position's average, STAT_EDGE either way.
 * A zero is neutral, not bad, for rare stats (under one a game, like
 * touchdowns) and where the stat is a side role (`sideRole`: a receiver's
 * rushing); where fewer is better, a zero is good.
 */
export function statLevel(
  value: number,
  average: number,
  lowerIsBetter = false,
  sideRole = false,
): StatLevel {
  const edge = STAT_EDGE - 1e-9;
  if (lowerIsBetter) {
    if (value === 0) return "good";
    return value <= average * (1 - edge)
      ? "good"
      : value >= average * (1 + edge)
        ? "bad"
        : "neutral";
  }
  if (value === 0 && (sideRole || average < 1)) return "neutral";
  return value >= average * (1 + edge) ? "good" : value <= average * (1 - edge) ? "bad" : "neutral";
}
