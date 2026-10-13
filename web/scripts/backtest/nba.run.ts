/**
 * NBA calibration on past seasons, kept by game day (ADR 0019):
 *
 *   .venv/bin/python -m trade_huddle_data build --sport nba --season 2024   (and 2025)
 *   npm run backtest:nba
 *
 * Three questions, one table each in ../.cache/nba-report.md:
 * 1. Form: how many recent games (9 against 12) and how much weight they get,
 *    judged on the points per game a player scores after each checkpoint.
 * 2. Durability: whether the share of his team's games a player has played
 *    predicts the points he adds per team game for the rest of the season.
 * 3. Centers: where preseason trade value puts centers against the draft market
 *    (ADP), by tier, for each market discount.
 *
 * Sleeper's season projections for a past NBA season are the season's real
 * averages (they correlate 0.998 with what players scored), so they would leak
 * the future. They are replaced by each player's projection for his first game
 * of week 1, which was made before the season (`preseasonProjections`).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import {
  buildModel,
  durability,
  makeScorer,
  playerScores,
  type LeagueSettings,
  type StatsFile,
  type StatsPlayer,
} from "../../src/lib/model";
import { NBA } from "../../src/lib/sports/nba";
import type { DurabilityParams, ModelParams, SportConfig } from "../../src/lib/sports/types";
import { spearman } from "./evaluate";

const SEASONS = ["2024", "2025"];
/** Checkpoints: after these fantasy weeks (25 in a season). */
const CHECKPOINTS = [1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18];
const CACHE = new URL("../../../.cache/", import.meta.url);
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
/** Players that matter per position: about 12 teams' rosters split over five positions. */
const RELEVANT = 30;
/** Games a player must have after the checkpoint to judge his points per game. */
const MIN_GAMES_AFTER = 10;

const ROSTER = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN"];
/** Two common points scorings: Sleeper's default, and a heavier one for stocks and assists. */
const LEAGUES: Record<string, LeagueSettings> = {
  sleeper: {
    roster_positions: ROSTER,
    total_rosters: 12,
    scoring_settings: {
      pts: 0.5,
      reb: 1,
      ast: 1,
      stl: 2,
      blk: 2,
      to: -1,
      tpm: 0.5,
      dd: 1,
      td: 2,
      bonus_pt_40p: 2,
      bonus_pt_50p: 2,
      bonus_reb_20p: 2,
      bonus_ast_15p: 2,
      tf: -2,
      ff: -2,
    },
  },
  heavy: {
    roster_positions: ROSTER,
    total_rosters: 12,
    scoring_settings: { pts: 1, reb: 1.2, ast: 1.5, stl: 3, blk: 3, to: -1 },
  },
};

/** Each player's projection for his first game of week 1 in place of the season projection. */
function preseasonProjections(stats: StatsFile): StatsFile {
  const firstWeek = Object.entries(stats.day_weeks ?? {})
    .filter(([, w]) => w === 1)
    .map(([d]) => Number(d))
    .sort((a, b) => a - b);
  const players = Object.fromEntries(
    Object.entries(stats.players).map(([id, p]) => {
      const day = firstWeek.find((d) => p.wp?.[String(d)]);
      return [id, { ...p, proj: day === undefined ? undefined : p.wp![String(day)] }];
    }),
  );
  return { ...stats, players };
}

function load(season: string): StatsFile | null {
  const file = new URL(`seasons/nba-${season}.json`, CACHE);
  return existsSync(file)
    ? preseasonProjections(JSON.parse(readFileSync(file, "utf8")) as StatsFile)
    : null;
}

/** The last game day of a fantasy week. */
function lastDay(stats: StatsFile, week: number): number {
  const days = Object.entries(stats.day_weeks ?? {})
    .filter(([, w]) => w <= week)
    .map(([d]) => Number(d));
  return Math.max(0, ...days);
}

/** The file as it looked after fantasy week `week`: the days played, the next week's projections. */
function truncate(stats: StatsFile, week: number): StatsFile {
  const day = lastDay(stats, week);
  const next = new Set(
    Object.entries(stats.day_weeks ?? {})
      .filter(([, w]) => w === week + 1)
      .map(([d]) => d),
  );
  const upTo = <T>(rec: Readonly<Record<string, T>> | undefined) =>
    rec ? Object.fromEntries(Object.entries(rec).filter(([d]) => Number(d) <= day)) : undefined;
  const players = Object.fromEntries(
    Object.entries(stats.players).map(([id, p]) => {
      const wp = p.wp ? Object.fromEntries(Object.entries(p.wp).filter(([d]) => next.has(d))) : {};
      return [id, { ...p, w: upTo(p.w), tw: upTo(p.tw), wp, i: undefined }];
    }),
  );
  return { ...stats, weeks: stats.weeks.filter((d) => d <= day), lineup_week: week + 1, players };
}

/** His team on each schedule day: the last team he played for, or the first one ahead. */
function teamOn(p: StatsPlayer, day: number): string | undefined {
  const known = Object.entries(p.tw ?? {})
    .map(([d, t]) => [Number(d), t] as const)
    .sort((a, b) => a[0] - b[0]);
  let team = known[0]?.[1] ?? p.t;
  for (const [d, t] of known) if (d <= day) team = t;
  return team;
}

function plays(stats: StatsFile, day: number, team: string | undefined): boolean {
  return Boolean(team) && (stats.schedule?.[String(day)] ?? []).some((g) => g.includes(team!));
}

interface After {
  /** Points per game played after the checkpoint (with enough games). */
  ppg: number | null;
  /** Points per team game after the checkpoint: what he adds, missed games included. */
  perTeamGame: number;
  /** He played his team's last game before the checkpoint (healthy then, as far as we know). */
  playedLast: boolean;
}

function actualAfter(stats: StatsFile, league: LeagueSettings, week: number): Map<string, After> {
  const score = makeScorer(stats.keys, league.scoring_settings);
  const day = lastDay(stats, week);
  const later = Object.keys(stats.schedule ?? {})
    .map(Number)
    .filter((d) => d > day);
  const out = new Map<string, After>();
  for (const [id, p] of Object.entries(stats.players)) {
    const pts = Object.entries(p.w ?? {})
      .filter(([d]) => Number(d) > day)
      .map(([, packed]) => score(packed));
    const teamGames = later.filter((d) => plays(stats, d, teamOn(p, d))).length;
    if (teamGames < 15) continue;
    const lastTeamDay = Math.max(
      0,
      ...stats.weeks.filter((d) => d <= day && plays(stats, d, teamOn(p, d))),
    );
    out.set(id, {
      playedLast: lastTeamDay > 0 && Boolean(p.w?.[String(lastTeamDay)]),
      ppg: pts.length >= MIN_GAMES_AFTER ? pts.reduce((s, x) => s + x, 0) / pts.length : null,
      perTeamGame: pts.reduce((s, x) => s + x, 0) / teamGames,
    });
  }
  return out;
}

interface Score {
  mae: number;
  rank: number;
}

/** Error and within-position rank correlation over each position's relevant players. */
function judge(rows: { pos: string; pred: number; real: number }[]): Score {
  let err = 0;
  let n = 0;
  const rho: number[] = [];
  for (const pos of POSITIONS) {
    const mine = rows.filter((r) => r.pos === pos);
    const byPred = new Set([...mine].sort((a, b) => b.pred - a.pred).slice(0, RELEVANT));
    const byReal = new Set([...mine].sort((a, b) => b.real - a.real).slice(0, RELEVANT));
    const relevant = mine.filter((r) => byPred.has(r) || byReal.has(r));
    for (const r of relevant) err += Math.abs(r.pred - r.real);
    n += relevant.length;
    rho.push(
      spearman(
        relevant.map((r) => r.pred),
        relevant.map((r) => r.real),
      ),
    );
  }
  return { mae: n ? err / n : 0, rank: rho.reduce((s, x) => s + x, 0) / rho.length };
}

const mean = (xs: readonly Score[]): Score => ({
  mae: xs.reduce((s, x) => s + x.mae, 0) / xs.length,
  rank: xs.reduce((s, x) => s + x.rank, 0) / xs.length,
});

type Case = { stats: StatsFile; league: LeagueSettings; week: number; after: Map<string, After> };

function cases(data: StatsFile[]): Case[] {
  return data.flatMap((stats) =>
    Object.values(LEAGUES).flatMap((league) =>
      CHECKPOINTS.map((week) => ({ stats, league, week, after: actualAfter(stats, league, week) })),
    ),
  );
}

/** 1. Form: expected points per game against what each player scored per game afterwards. */
function formScore(all: Case[], params: ModelParams): Score {
  return mean(
    all.map(({ stats, league, week, after }) => {
      const model = buildModel(truncate(stats, week), league, { ...NBA, model: params });
      return judge(
        Object.values(model.players).flatMap((p) => {
          const real = after.get(p.id)?.ppg;
          return real == null ? [] : [{ pos: p.pos, pred: p.value, real }];
        }),
      );
    }),
  );
}

/** 2. Durability: expected points per game × durability ** power, against points per team game. */
function durabilityScore(
  all: Case[],
  d: DurabilityParams | null,
  power: number,
  healthyOnly: boolean,
): Score {
  return mean(
    all.map(({ stats, league, week, after }) => {
      const past = truncate(stats, week);
      const model = buildModel(past, league, NBA);
      return judge(
        Object.values(model.players).flatMap((p) => {
          const a = after.get(p.id);
          if (!a || (healthyOnly && !a.playedLast)) return [];
          const real = a.perTeamGame;
          const share = d ? durability(past, p, d) : 1;
          return [{ pos: p.pos, pred: p.value * share ** power, real }];
        }),
      );
    }),
  );
}

/** A preseason view: last season replaced by 82 games of the projection; no games yet. */
function preseason(stats: StatsFile): StatsFile {
  const games = stats.season_games ?? 82;
  const players: Record<string, StatsPlayer> = {};
  for (const [id, p] of Object.entries(stats.players)) {
    if (!p.proj) continue;
    const s = p.proj.map((x, i) => (i % 2 ? x * games : x));
    players[id] = { ...p, prev: { g: games, s }, w: undefined, tw: undefined, i: undefined };
  }
  return { ...stats, weeks: [], players, lineup_week: 1 };
}

const TIERS: [number, number][] = [
  [1, 50],
  [51, 100],
  [101, 150],
  [151, 200],
];

/** 3. Centers: preseason trade value against ADP; centers' rank gap by ADP tier. */
function marketFit(data: StatsFile[], sport: SportConfig) {
  let rho = 0;
  const gap = TIERS.map(() => [] as number[]);
  for (const stats of data) {
    const pre = preseason(stats);
    for (const league of Object.values(LEAGUES)) {
      const model = buildModel(pre, league, sport);
      const scores = playerScores(model, pre, [], sport);
      const rows = Object.values(model.players)
        .map((p) => ({
          pos: p.pos,
          trade: scores.get(p.id)!.trade,
          adp: pre.players[p.id]?.adp?.std,
        }))
        .filter((r): r is { pos: string; trade: number; adp: number } => r.adp !== undefined);
      rho += spearman(
        rows.map((r) => -r.trade),
        rows.map((r) => r.adp),
      );
      // Our rank among drafted players against the market's: positive = we rate him lower.
      const ours = [...rows].sort((a, b) => b.trade - a.trade);
      const market = [...rows].sort((a, b) => a.adp - b.adp);
      for (const r of rows) {
        if (r.pos !== "C") continue;
        const t = TIERS.findIndex(([lo, hi]) => r.adp >= lo && r.adp <= hi);
        if (t >= 0) gap[t]!.push(ours.indexOf(r) - market.indexOf(r));
      }
    }
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return { rho: rho / (data.length * Object.keys(LEAGUES).length), gap: gap.map(avg) };
}

const f = (x: number, d = 3) => x.toFixed(d);

it("nba", { timeout: 60 * 60 * 1000 }, () => {
  const data = SEASONS.flatMap((s) => load(s) ?? []);
  if (!data.length) {
    console.log("No NBA seasons in .cache/seasons. Build them with the pipeline first.");
    return;
  }
  const all = cases(data);
  const live = NBA.model;
  const lines: string[] = ["# NBA calibration", ""];
  lines.push(
    `Seasons ${SEASONS.join(", ")} (Sleeper's 2024-25 and 2025-26); leagues ${Object.keys(LEAGUES).join(", ")}; ` +
      `checkpoints after fantasy weeks ${CHECKPOINTS.join(", ")}. MAE in fantasy points (lower is better); ` +
      `rank = Spearman correlation within position (higher is better). No injury report in past files; ` +
      `the preseason projection is each player's first-game projection (see the top of nba.run.ts).`,
    "",
  );

  // 1. Form.
  const form: [string, ModelParams][] = [];
  // The projection's scale is left as is: the first-game projection standing in for it here
  // is another number (it runs 7-11% below the season's average), so it cannot calibrate it.
  for (const prevReliabilityGames of [5, 10, 20, 38])
    for (const recentGames of [9, 12, 15])
      for (const recentShare of [0.25, 0.4])
        form.push([
          `reliability ${prevReliabilityGames}, last ${recentGames}, share ${recentShare}`,
          { ...live, prevReliabilityGames, recentGames, recentShare },
        ]);
  const formRows = form.map(([label, p]) => ({ label, ...formScore(all, p) }));
  const liveForm = formScore(all, live);
  formRows.sort((a, b) => a.mae - b.mae);
  lines.push("## 1. Recent form (points per game after the checkpoint)", "");
  lines.push("| Settings | MAE | Rank |", "|---|---|---|");
  lines.push(
    `| live: last ${live.recentGames}, share ${live.recentShare}, reliability ${live.prevReliabilityGames} | ${f(liveForm.mae)} | ${f(liveForm.rank)} |`,
  );
  for (const r of formRows.slice(0, 20)) lines.push(`| ${r.label} | ${f(r.mae)} | ${f(r.rank)} |`);

  // 2. Durability.
  lines.push("", "## 2. Durability (points per team game after the checkpoint)", "");
  lines.push(
    "All players, and only those who played their team's last game (healthy at the checkpoint: " +
      "the site already discounts injured players by their status, so this is the gain on top).",
    "",
  );
  lines.push(
    "| Durability | MAE all | Rank all | MAE healthy | Rank healthy |",
    "|---|---|---|---|---|",
  );
  const row = (label: string, d: DurabilityParams | null, power: number) => {
    const a = durabilityScore(all, d, power, false);
    const h = durabilityScore(all, d, power, true);
    return { label, a, h };
  };
  const none = row("none", null, 0);
  const dur = [];
  for (const shrinkGames of [20, 40, 80])
    for (const lastSeason of [0, 0.5, 1])
      for (const power of [0.5, 1])
        dur.push(
          row(
            `shrink ${shrinkGames}, last season ×${lastSeason}, power ${power}`,
            { shrinkGames, lastSeason, typical: 0.8 },
            power,
          ),
        );
  dur.sort((a, b) => b.h.rank - a.h.rank);
  for (const r of [none, ...dur.slice(0, 12)])
    lines.push(`| ${r.label} | ${f(r.a.mae)} | ${f(r.a.rank)} | ${f(r.h.mae)} | ${f(r.h.rank)} |`);

  // 3. Centers.
  lines.push("", "## 3. Centers against the draft market (preseason)", "");
  lines.push(
    "Spearman between trade value and ADP over drafted players; centers' average rank gap by ADP tier (positive: we rate them lower than the market).",
    "",
  );
  lines.push(
    `| C discount | Correlation | ${TIERS.map(([lo, hi]) => `ADP ${lo}-${hi}`).join(" | ")} |`,
    `|---|---|${TIERS.map(() => "---").join("|")}|`,
  );
  for (const c of [0, 0.2, 0.35, 0.5]) {
    const sport = { ...NBA, tradeValue: { ...NBA.tradeValue, positionMarket: { C: c } } };
    const m = marketFit(data, sport);
    lines.push(`| ${c} | ${f(m.rho)} | ${m.gap.map((g) => f(g, 1)).join(" | ")} |`);
  }

  const report = lines.join("\n") + "\n";
  writeFileSync(new URL("nba-report.md", CACHE), report);
  console.log(report);
});
