/**
 * Matchup backtest (ADR 0034), two questions over 2024 and 2025:
 *
 * 1. After checkpoint N, how well does a defense's points-allowed factor
 *    (defenseFactors with `shrink` games of an average defense mixed in)
 *    predict the factor it allows from then on, by position? "Shrink ∞" calls
 *    every defense average. NFL and NBA.
 * 2. NFL team defenses: does their rest-of-season value predict the points
 *    they score afterwards better when pulled toward the average and scaled by
 *    the opponents left (model/scheduleValue.ts)? The factors use the live
 *    shrink for DEF (question 1 sets it); `regress` and `elasticity` are
 *    fitted on one season and judged on the other.
 *
 *   npm run backtest:matchups   (needs past seasons in .cache/seasons)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildModel, type LeagueSettings, type StatsFile } from "../../src/lib/model";
import { adjustForSchedule } from "../../src/lib/model/scheduleValue";
import { defenseFactors, opponents } from "../../src/lib/model/weekly";
import { NBA } from "../../src/lib/sports/nba";
import { NFL } from "../../src/lib/sports/nfl";
import type { ScheduleValueRule, SportConfig } from "../../src/lib/sports/types";
import { actualAfter, lastDay, truncate } from "./evaluate";
import { BENCHMARK_LEAGUES } from "./leagues";

const SEASONS = ["2024", "2025"];
const SHRINKS = [0, 2, 4, 8, 16, 32, 64, Infinity];

interface SportRun {
  sport: SportConfig;
  file: (season: string) => string;
  /** Checkpoints: NFL weeks, NBA fantasy weeks. */
  checkpoints: number[];
  positions: string[];
  league: LeagueSettings;
}

const RUNS: SportRun[] = [
  {
    sport: NFL,
    file: (s) => `nfl-${s}.json`,
    checkpoints: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    positions: ["QB", "RB", "WR", "TE", "DEF"],
    league: BENCHMARK_LEAGUES.PPR!,
  },
  {
    sport: NBA,
    file: (s) => `nba-${s}.json`,
    checkpoints: [3, 4, 6, 8, 10, 12, 14],
    positions: ["PG", "SG", "SF", "PF", "C"],
    league: {
      roster_positions: ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "UTIL", "BN", "BN", "BN"],
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
      },
    },
  },
];

function load(file: string): StatsFile | null {
  const url = new URL(`../../../.cache/seasons/${file}`, import.meta.url);
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as StatsFile) : null;
}

/** Squared error of the factor so far against the factor afterwards, by position and shrink. */
function factorErrors(run: SportRun): Map<string, Map<number, { se: number; n: number }>> {
  const out = new Map<string, Map<number, { se: number; n: number }>>();
  for (const season of SEASONS) {
    const full = load(run.file(season));
    if (!full) continue;
    // One model over the whole season: defenseFactors only reads each week's points.
    const model = buildModel(full, run.league, run.sport);
    for (const checkpoint of run.checkpoints) {
      const last = full.period === "day" ? lastDay(full, checkpoint) : checkpoint;
      const before = { ...full, weeks: full.weeks.filter((w) => w <= last) };
      const after = { ...full, weeks: full.weeks.filter((w) => w > last) };
      const truth = defenseFactors(model, after, 0);
      for (const shrink of SHRINKS) {
        const so = Number.isFinite(shrink) ? defenseFactors(model, before, shrink) : null;
        for (const [defense, byPos] of truth) {
          for (const pos of run.positions) {
            const real = byPos.get(pos);
            if (real === undefined) continue;
            const pred = so ? (so.get(defense)?.get(pos) ?? 1) : 1;
            const byShrink = out.get(pos) ?? new Map<number, { se: number; n: number }>();
            const acc = byShrink.get(shrink) ?? { se: 0, n: 0 };
            byShrink.set(shrink, { se: acc.se + (pred - real) ** 2, n: acc.n + 1 });
            out.set(pos, byShrink);
          }
        }
      }
    }
  }
  return out;
}

/** One NFL defense at one checkpoint: its value, the average value, its opponents and the truth. */
interface DefenseRow {
  season: string;
  value: number;
  average: number;
  /** Opponents' average factor, by shrink. */
  factor: Map<number, number>;
  real: number;
}

/** The live shrink for team defenses' factors. */
const DEF_SHRINK = NFL.model.matchupShrinkByPos.DEF ?? NFL.model.matchupShrinkGames;
const DEF_SHRINKS = [...new Set([2, DEF_SHRINK])];

function defenseRows(): DefenseRow[] {
  const rows: DefenseRow[] = [];
  const league = BENCHMARK_LEAGUES.PPR!;
  const live = { ...NFL, model: { ...NFL.model, scheduleValue: {} } };
  for (const season of SEASONS) {
    const full = load(`nfl-${season}.json`);
    if (!full) continue;
    for (let checkpoint = 3; checkpoint <= 12; checkpoint++) {
      const view = truncate(full, checkpoint);
      const model = buildModel(view, league, live);
      const real = actualAfter(full, league, checkpoint, 3);
      const defenses = Object.values(model.players).filter((p) => p.pos === "DEF" && !p.noTeam);
      const average = defenses.reduce((s, p) => s + p.value, 0) / defenses.length;
      const left = new Map<string, string[]>();
      for (const period of Object.keys(full.schedule ?? {}).map(Number)) {
        if (period <= checkpoint) continue;
        for (const [team, game] of opponents(full, period)) {
          left.set(team, [...(left.get(team) ?? []), game.opponent]);
        }
      }
      const factors = new Map(DEF_SHRINKS.map((k) => [k, defenseFactors(model, view, k)]));
      for (const p of defenses) {
        const r = real.get(p.id);
        const opps = left.get(p.team) ?? [];
        if (r === undefined || !opps.length) continue;
        const factor = new Map(
          DEF_SHRINKS.map((k) => {
            const f = factors.get(k)!;
            return [k, opps.reduce((s, o) => s + (f.get(o)?.get("DEF") ?? 1), 0) / opps.length];
          }),
        );
        rows.push({ season, value: p.value, average, factor, real: r });
      }
    }
  }
  return rows;
}

interface Setting extends ScheduleValueRule {
  shrink: number;
}

const maeOf = (rows: readonly DefenseRow[], s: Setting) =>
  rows.reduce(
    (sum, r) =>
      sum + Math.abs(adjustForSchedule(r.value, r.average, r.factor.get(s.shrink)!, s) - r.real),
    0,
  ) / rows.length;

function* settings(): Generator<Setting> {
  const shrink = DEF_SHRINK;
  for (let regress = 0.2; regress <= 1.001; regress += 0.1)
    for (let elasticity = 0; elasticity <= 4.001; elasticity += 0.25)
      yield { shrink, regress: +regress.toFixed(2), elasticity };
}

const best = (rows: readonly DefenseRow[]) =>
  [...settings()].reduce((a, b) => (maeOf(rows, b) < maeOf(rows, a) ? b : a));

it("matchups", { timeout: 60 * 60 * 1000 }, () => {
  const lines = [
    "# Matchup backtest",
    "",
    "## 1. Points-allowed factor so far vs afterwards",
    "",
    "Mean squared error of each defense's factor after checkpoint N (with `shrink` games of an average defense mixed in) against the factor it allowed afterwards. ∞ = every defense average. Lower is better.",
    "",
  ];
  for (const run of RUNS) {
    const errors = factorErrors(run);
    if (!errors.size) continue;
    lines.push(
      `### ${run.sport.id.toUpperCase()}`,
      "",
      `| Position | ${SHRINKS.map((s) => (Number.isFinite(s) ? s : "∞")).join(" | ")} |`,
      `|---|${SHRINKS.map(() => "---").join("|")}|`,
    );
    for (const [pos, byShrink] of errors) {
      const cells = SHRINKS.map((s) => {
        const e = byShrink.get(s)!;
        return (e.se / e.n).toFixed(4);
      });
      lines.push(`| ${pos} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  }

  const rows = defenseRows();
  if (rows.length) {
    const none: Setting = { shrink: 2, regress: 1, elasticity: 0 };
    const [a, b] = SEASONS.map((s) => rows.filter((r) => r.season === s));
    const fitA = best(a!);
    const fitB = best(b!);
    const all = best(rows);
    const out = (maeOf(b!, fitA) * b!.length + maeOf(a!, fitB) * a!.length) / rows.length;
    const mean = rows.reduce((s, r) => s + r.real, 0) / rows.length;
    const flat = rows.reduce((s, r) => s + Math.abs(mean - r.real), 0) / rows.length;
    const show = (s: Setting) =>
      `shrink ${s.shrink}, regress ${s.regress}, elasticity ${s.elasticity}`;
    lines.push(
      "## 2. NFL team defenses: rest-of-season value with the schedule",
      "",
      `${rows.length} defense × checkpoint rows (weeks 3-12), points per game afterwards. MAE, lower is better.`,
      "",
      "| Model | MAE |",
      "|---|---|",
      `| Same average for every defense | ${flat.toFixed(3)} |`,
      `| Value as is | ${maeOf(rows, none).toFixed(3)} |`,
      `| Fitted on ${SEASONS[0]}, judged on ${SEASONS[1]} and back (${show(fitA)} / ${show(fitB)}) | ${out.toFixed(3)} |`,
      `| Fitted on both (${show(all)}) | ${maeOf(rows, all).toFixed(3)} |`,
      "",
      "| Setting | " + SEASONS.join(" | ") + " |",
      "|---|" + SEASONS.map(() => "---").join("|") + "|",
    );
    const live = NFL.model.scheduleValue.DEF;
    const candidates: [string, Setting][] = [
      ["Value as is", none],
      ...(live
        ? ([["Live", { ...live, shrink: NFL.model.matchupShrinkGames }]] as [string, Setting][])
        : []),
      ["Fitted on both", all],
    ];
    for (const [label, s] of candidates) {
      lines.push(
        `| ${label} (${show(s)}) | ${[a!, b!].map((r) => maeOf(r, s).toFixed(3)).join(" | ")} |`,
      );
    }
    lines.push("");
  }
  const report = lines.join("\n");
  writeFileSync(new URL("../../../.cache/matchups-report.md", import.meta.url), report);
  console.log(report);
});
