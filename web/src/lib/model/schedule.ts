/**
 * Schedule facts for the trade analyzer: each player's bye week and the
 * strength of the schedule he has left, from what his opponents' defenses
 * allowed to his position so far (the weekly lineup's defense factors), for
 * the regular season's weeks left and, apart, the league's playoff weeks. Information
 * only: it never changes trade value or fairness. What a defense allowed so
 * far barely predicts what it allows later (ADR 0026), so it is shown as
 * context, never turned into points.
 */
import type { ModelParams } from "../sports/types";
import { matchupLevel, type MatchupLevel } from "./matchup";
import { currentPeriod, periodWeek } from "./periods";
import type { LeagueSettings, Model, StatsFile } from "./types";
import { defenseFactors, opponents } from "./weekly";

export interface ScheduleStrength {
  /** Games left in the league's fantasy season. */
  games: number;
  /** Average opponent factor for his position (1 = average; above 1 = easier). */
  factor: number;
  /** Games against defenses that allow clearly more (good) or fewer (tough) than average. */
  good: number;
  tough: number;
  /** Easy (good), neutral or tough, against the other teams' schedules. */
  level: MatchupLevel;
  /** His team's schedule among every team's, for his position: 1 = easiest. */
  place: number;
  of: number;
}

export interface PlayerSchedule {
  /** The week his team does not play (the NFL), or null (none, or the NBA). */
  bye: number | null;
  /** The bye is behind him: the week was played already. */
  byeDone: boolean;
  /** The regular season's weeks left, and the league's playoff weeks (null when unknown). */
  regular: ScheduleStrength | null;
  playoffs: ScheduleStrength | null;
}

/** A schedule this share easier (or harder) than average is easy (or tough). */
export const SCHEDULE_EDGE = 0.03;

/** The weeks a league's playoffs take, from Sleeper's settings; empty when it does not say. */
export function playoffWeeks(league: LeagueSettings): number[] {
  const s = league.settings;
  const start = s?.playoff_week_start;
  if (!start) return [];
  const rounds = Math.max(1, Math.ceil(Math.log2(Math.max(2, s.playoff_teams ?? 6))));
  // Sleeper's round types: one week each (0), a two-week final (1), two weeks each (2).
  const type = s.playoff_round_type ?? 0;
  const length = type === 2 ? rounds * 2 : type === 1 ? rounds + 1 : rounds;
  return Array.from({ length }, (_, i) => start + i);
}

/** Each team's bye: the one regular-season week it has no game (weeks only, not game days). */
export function byeWeeks(stats: StatsFile): Map<string, number> {
  const out = new Map<string, number>();
  if (stats.period === "day" || !stats.schedule) return out;
  const weeks = Object.keys(stats.schedule)
    .map(Number)
    .sort((a, b) => a - b);
  const teams = new Set(weeks.flatMap((w) => [...opponents(stats, w).keys()]));
  for (const team of teams) {
    const off = weeks.filter((w) => !opponents(stats, w).has(team));
    if (off.length === 1) out.set(team, off[0]!);
  }
  return out;
}

/** The periods still to play, split into the regular season and the league's playoff weeks. */
function periodsLeft(
  stats: StatsFile,
  league: LeagueSettings,
): { regular: number[]; playoffs: number[] } {
  const from = currentPeriod(stats);
  const lastPlayed = Math.max(0, ...stats.weeks);
  const playoffs = playoffWeeks(league);
  const left = Object.keys(stats.schedule ?? {})
    .map(Number)
    .filter((p) => p >= from && (stats.period !== "day" || p > lastPlayed));
  if (!playoffs.length) return { regular: left, playoffs: [] };
  const first = playoffs[0]!;
  const last = playoffs.at(-1)!;
  return {
    regular: left.filter((p) => periodWeek(stats, p) < first),
    playoffs: left.filter((p) => periodWeek(stats, p) >= first && periodWeek(stats, p) <= last),
  };
}

/** Rates each team's opponents in some periods, for each position, ranked among the teams. */
function strengthOver(
  stats: StatsFile,
  periods: readonly number[],
  factors: Map<string, Map<string, number>>,
): (team: string, pos: string) => ScheduleStrength | null {
  const left = new Map<string, string[]>();
  for (const period of periods) {
    for (const [team, game] of opponents(stats, period)) {
      left.set(team, [...(left.get(team) ?? []), game.opponent]);
    }
  }
  const each = (team: string, pos: string) =>
    (left.get(team) ?? []).map((o) => factors.get(o)?.get(pos) ?? 1);
  const average = (list: number[]) => list.reduce((s, f) => s + f, 0) / list.length;
  // Every team's factor for a position, easiest first, for the rank.
  const rankings = new Map<string, number[]>();
  const ranking = (pos: string) => {
    let list = rankings.get(pos);
    if (!list) {
      list = [...left.keys()].map((t) => average(each(t, pos))).sort((a, b) => b - a);
      rankings.set(pos, list);
    }
    return list;
  };
  const edge = SCHEDULE_EDGE - 1e-9;
  return (team, pos) => {
    const games = each(team, pos);
    // Before any game is played there is nothing to rate the defenses by.
    if (!games.length || !factors.size) return null;
    const factor = average(games);
    const list = ranking(pos);
    const diff = factor - 1;
    return {
      games: games.length,
      factor,
      good: games.filter((f) => matchupLevel(f) === "good").length,
      tough: games.filter((f) => matchupLevel(f) === "tough").length,
      level: diff >= edge ? "good" : diff <= -edge ? "tough" : "neutral",
      place: list.filter((f) => f > factor).length + 1,
      of: list.length,
    };
  };
}

/** Every player's bye and schedule strength; players without a team get neither. */
export function playerSchedules(
  model: Model,
  stats: StatsFile,
  league: LeagueSettings,
  params: Pick<ModelParams, "matchupShrinkGames">,
): Map<string, PlayerSchedule> {
  const factors = defenseFactors(model, stats, params.matchupShrinkGames);
  const byes = byeWeeks(stats);
  const thisWeek = periodWeek(stats, currentPeriod(stats));
  const periods = periodsLeft(stats, league);
  const regular = strengthOver(stats, periods.regular, factors);
  const playoffs = strengthOver(stats, periods.playoffs, factors);
  const out = new Map<string, PlayerSchedule>();
  for (const p of Object.values(model.players)) {
    const team = p.noTeam ? "" : p.team;
    const bye = (team && byes.get(team)) || null;
    out.set(p.id, {
      bye,
      byeDone: bye !== null && bye < thisWeek,
      regular: team ? regular(team, p.pos) : null,
      playoffs: team ? playoffs(team, p.pos) : null,
    });
  }
  return out;
}

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
};

/** Schedule strength in words, for a tooltip: what the number means and where it comes from. */
export function scheduleNote(s: ScheduleStrength, pos: string, stretch: string): string {
  const pct = Math.round(Math.abs(s.factor - 1) * 100);
  const allow =
    pct === 0
      ? `${stretch}: opponents allow about the average to ${pos}s`
      : `${stretch}: opponents allow ${pct}% ${s.factor > 1 ? "more" : "fewer"} points than average to ${pos}s`;
  const rank = s.place === 1 ? "the easiest" : `${ordinal(s.place)} easiest`;
  const games = `${s.games} game${s.games === 1 ? "" : "s"}`;
  return `${allow} (${games}: ${s.good} good, ${s.tough} tough); ${rank} of ${s.of}. Based on games so far; information only.`;
}
