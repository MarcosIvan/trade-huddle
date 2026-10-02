/**
 * What the player card shows: each game this season (points and stat line)
 * and the games left, each rated by how much its defense allows to the
 * player's position.
 */
import type { SportConfig } from "../sports/types";
import { starterLine } from "./trades";
import type { Model, Player, StatsFile } from "./types";
import { opponents } from "./weekly";

/** How a defense treats a position: easy allows more than average, hard fewer. */
export type MatchupLevel = "easy" | "neutral" | "hard";

/** A defense allowing at least this share more (or fewer) points than average is easy (or hard). */
export const MATCHUP_EDGE = 0.08;

export function matchupLevel(factor: number): MatchupLevel {
  // A hair of tolerance, so 0.92 counts as 8% below average despite floating point.
  const diff = factor - 1;
  const edge = MATCHUP_EDGE - 1e-9;
  return diff >= edge ? "easy" : diff <= -edge ? "hard" : "neutral";
}

/** Defense factors by team and position (1 = average), as from defenseFactors. */
export type DefenseFactors = ReadonlyMap<string, ReadonlyMap<string, number>>;

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
  /** What the opponent allows to the position (1 = average); null when unknown. */
  factor: number | null;
  level: MatchupLevel | null;
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

/** The player's season game by game and the games he has left. */
export function playerCard(
  player: Player,
  stats: StatsFile,
  factors: DefenseFactors,
  sport: SportConfig,
): PlayerCard {
  const sp = stats.players[player.id];
  const shown = new Set(
    (sport.gameLog[player.pos] ?? []).flatMap((g) => g.columns.map((c) => c.key)),
  );
  const game = (week: number, team: string, pts: number | null, packed?: readonly number[]) => {
    const scheduled = stats.schedule?.[String(week)] !== undefined;
    const g = team ? opponents(stats, week).get(team) : undefined;
    const factor = g ? (factors.get(g.opponent)?.get(player.pos) ?? null) : null;
    const line = unpack(stats, packed);
    return {
      week,
      opponent: g?.opponent ?? null,
      home: g?.home ?? false,
      bye: Boolean(team) && scheduled && !g,
      pts,
      stats: Object.fromEntries(Object.entries(line).filter(([k]) => shown.has(k))),
      factor,
      level: factor === null ? null : matchupLevel(factor),
    };
  };

  // The week to set a lineup for may be under way: a game already played there counts as
  // played, one still to come as upcoming.
  const current = stats.lineup_week ?? Math.max(0, ...stats.weeks) + 1;
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

/** How one game's number compares with what the position usually does (statBenchmarks). */
export type StatLevel = "good" | "neutral" | "bad";

/** A game at least this share above (or below) the position's average is good (or bad). */
export const STAT_EDGE = 0.15;

/** Key for fantasy points in the benchmarks. */
export const PTS_KEY = "pts";

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
