/**
 * Strength-of-schedule backtest: after week N, does the opponents' average
 * points-allowed factor tell how a player's points per game will differ from
 * his value over the rest of the season? For each "games of average defense"
 * mixed into the factors, it fits the share of the factor that shows up in
 * later points (`weight`) and checks it on the other season. It found none,
 * so the site shows only the games left (ADR 0026).
 *
 *   npm run backtest:schedule   (needs past seasons in .cache/seasons)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildModel, type LeagueSettings, type StatsFile } from "../../src/lib/model";
import { defenseFactors, opponents } from "../../src/lib/model/weekly";
import { NBA } from "../../src/lib/sports/nba";
import { NFL } from "../../src/lib/sports/nfl";
import type { SportConfig } from "../../src/lib/sports/types";
import { actualAfter, lastDay, truncate, truncateDays } from "./evaluate";
import { BENCHMARK_LEAGUES } from "./leagues";

const SEASONS = ["2024", "2025"];
const SHRINKS = [2, 4, 8, 16, 32];

interface SportRun {
  sport: SportConfig;
  file: (season: string) => string;
  /** Checkpoints: NFL weeks, NBA fantasy weeks. */
  checkpoints: number[];
  /** Players per position judged: the top by value. */
  relevant: Record<string, number>;
  minGamesAfter: number;
  league: LeagueSettings;
}

const NBA_LEAGUE: LeagueSettings = {
  roster_positions: ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "UTIL", "BN", "BN", "BN"],
  total_rosters: 12,
  scoring_settings: { pts: 0.5, reb: 1, ast: 1, stl: 2, blk: 2, to: -1, tpm: 0.5, dd: 1, td: 2 },
};

const RUNS: SportRun[] = [
  {
    sport: NFL,
    file: (s) => `nfl-${s}.json`,
    checkpoints: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    relevant: { QB: 24, RB: 48, WR: 60, TE: 24 },
    minGamesAfter: 4,
    league: BENCHMARK_LEAGUES.PPR!,
  },
  {
    sport: NBA,
    file: (s) => `nba-${s}.json`,
    checkpoints: [3, 4, 6, 8, 10, 12, 14],
    relevant: { PG: 30, SG: 30, SF: 30, PF: 30, C: 30 },
    minGamesAfter: 10,
    league: NBA_LEAGUE,
  },
];

/** One judged player at one checkpoint: his value, the schedule's raw effect and the truth. */
interface Row {
  season: string;
  base: number;
  /** base × (raw opponent factor − 1): the schedule's effect at weight 1. */
  x: number;
  real: number;
}

/** The file after a checkpoint, each player on the team he last played for (past files keep today's team). */
function asOf(stats: StatsFile, checkpoint: number): { view: StatsFile; lastPeriod: number } {
  const view =
    stats.period === "day" ? truncateDays(stats, checkpoint) : truncate(stats, checkpoint);
  const lastPeriod = stats.period === "day" ? lastDay(stats, checkpoint) : checkpoint;
  const players = Object.fromEntries(
    Object.entries(view.players).map(([id, p]) => {
      const played = Object.entries(p.tw ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]));
      const team = played.at(-1)?.[1] ?? p.t;
      return [id, { ...p, t: team, i: undefined }];
    }),
  );
  return { view: { ...view, players }, lastPeriod };
}

function rowsFor(run: SportRun, shrink: number): Row[] {
  const rows: Row[] = [];
  for (const season of SEASONS) {
    const url = new URL(`../../../.cache/seasons/${run.file(season)}`, import.meta.url);
    if (!existsSync(url)) continue;
    const full = JSON.parse(readFileSync(url, "utf8")) as StatsFile;
    for (const checkpoint of run.checkpoints) {
      const { view, lastPeriod } = asOf(full, checkpoint);
      const model = buildModel(view, run.league, run.sport);
      const factors = defenseFactors(model, view, shrink);
      // Each team's opponents after the checkpoint.
      const left = new Map<string, string[]>();
      for (const period of Object.keys(full.schedule ?? {}).map(Number)) {
        if (period <= lastPeriod) continue;
        for (const [team, game] of opponents(full, period)) {
          left.set(team, [...(left.get(team) ?? []), game.opponent]);
        }
      }
      const after = actualAfter(full, run.league, lastPeriod, run.minGamesAfter);
      for (const [pos, top] of Object.entries(run.relevant)) {
        const players = Object.values(model.players)
          .filter((p) => p.pos === pos && !p.noTeam)
          .sort((a, b) => b.value - a.value)
          .slice(0, top);
        for (const p of players) {
          const real = after.get(p.id);
          // A trade after the checkpoint changes the schedule: those players are left out.
          const later = Object.entries(full.players[p.id]?.tw ?? {}).filter(
            ([d]) => Number(d) > lastPeriod,
          );
          if (real === undefined || later.some(([, t]) => t !== p.team)) continue;
          const opps = left.get(p.team);
          if (!opps?.length) continue;
          const factor =
            opps.reduce((s, o) => s + (factors.get(o)?.get(p.pos) ?? 1), 0) / opps.length;
          const base = p.injMult > 0 ? p.value / p.injMult : p.value;
          rows.push({ season, base, x: base * (factor - 1), real });
        }
      }
    }
  }
  return rows;
}

/** Least-squares weight of the schedule effect on what the value missed. */
function fit(rows: readonly Row[]): number {
  const sxy = rows.reduce((s, r) => s + r.x * (r.real - r.base), 0);
  const sxx = rows.reduce((s, r) => s + r.x * r.x, 0);
  return sxx > 0 ? sxy / sxx : 0;
}

const mae = (rows: readonly Row[], weight: number) =>
  rows.reduce((s, r) => s + Math.abs(r.base + weight * r.x - r.real), 0) / rows.length;

function corr(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

it("schedule", { timeout: 60 * 60 * 1000 }, () => {
  const lines = [
    "# Strength-of-schedule backtest",
    "",
    "After checkpoint N, value × (1 + weight × (opponents' factor − 1)) against the points per game each player scored afterwards (same team only). `weight` is fitted on one season and judged on the other (out of sample); MAE in points per game, lower is better.",
    "",
  ];
  for (const run of RUNS) {
    lines.push(
      `## ${run.sport.id.toUpperCase()}`,
      "",
      "| Shrink | Rows | Corr(effect, miss) | Weight (both) | MAE value only | MAE out of sample |",
      "|---|---|---|---|---|---|",
    );
    for (const shrink of SHRINKS) {
      const rows = rowsFor(run, shrink);
      if (!rows.length) continue;
      const [a, b] = SEASONS.map((s) => rows.filter((r) => r.season === s));
      const out =
        a!.length && b!.length
          ? (mae(b!, fit(a!)) * b!.length + mae(a!, fit(b!)) * a!.length) / rows.length
          : NaN;
      lines.push(
        `| ${shrink} | ${rows.length} | ${corr(
          rows.map((r) => r.x),
          rows.map((r) => r.real - r.base),
        ).toFixed(3)} | ${fit(rows).toFixed(2)} | ${mae(rows, 0).toFixed(3)} | ${out.toFixed(3)} |`,
      );
    }
    lines.push("");
  }
  const report = lines.join("\n");
  writeFileSync(new URL("../../../.cache/schedule-report.md", import.meta.url), report);
  console.log(report);
});
