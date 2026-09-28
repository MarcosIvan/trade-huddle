/**
 * Week-ahead backtest: with data through week N, predict every player's
 * points in week N+1 and compare with what happened.
 *
 *   npm run backtest:weekly   (needs past seasons in .cache/seasons)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildModel, makeScorer, type Model, type StatsFile } from "../../src/lib/model";
import { weeklyOutlook } from "../../src/lib/model/weekly";
import { NFL } from "../../src/lib/sports/nfl";
import type { ModelParams } from "../../src/lib/sports/types";
import { truncate } from "./evaluate";
import { BENCHMARK_LEAGUES } from "./leagues";

const SEASONS = ["2024", "2025"];
const WEEKS = Array.from({ length: 14 }, (_, i) => i + 3); // predict weeks 4..17
/** Players per position a lineup decision is about: the top of the prediction. K and DEF are
 * close to unpredictable week to week and are left out of the metric. */
const RELEVANT: Record<string, number> = { QB: 24, RB: 48, WR: 60, TE: 24 };

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(values.length);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 3) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  return 1 - (6 * ra.reduce((s, r, i) => s + (r - rb[i]!) ** 2, 0)) / (n * (n * n - 1));
}

interface Case {
  stats: StatsFile;
  league: (typeof BENCHMARK_LEAGUES)[string];
  model: Model;
  week: number;
  actual: Map<string, number>;
}

it("weekly", { timeout: 60 * 60 * 1000 }, () => {
  const cases: Case[] = [];
  for (const season of SEASONS) {
    const url = new URL(`../../../.cache/seasons/nfl-${season}.json`, import.meta.url);
    if (!existsSync(url)) continue;
    const full = JSON.parse(readFileSync(url, "utf8")) as StatsFile;
    for (const league of Object.values(BENCHMARK_LEAGUES)) {
      const score = makeScorer(full.keys, league.scoring_settings);
      for (const n of WEEKS) {
        // No injury report for past seasons: availability is left out on purpose,
        // and only players who actually played week N+1 are scored.
        const view = truncate(full, n);
        const players = Object.fromEntries(
          Object.entries(view.players).map(([id, p]) => [id, { ...p, i: undefined }]),
        );
        const stats = { ...view, players };
        const actual = new Map<string, number>();
        for (const [id, p] of Object.entries(full.players)) {
          const packed = p.w?.[String(n + 1)];
          if (packed) actual.set(id, score(packed));
        }
        cases.push({ stats, league, model: buildModel(stats, league, NFL), week: n + 1, actual });
      }
    }
  }
  if (!cases.length) {
    console.log("No past seasons in .cache/seasons. Build them with the pipeline first.");
    return;
  }

  const byPosition = (params: ModelParams) => {
    const out: Record<string, number> = {};
    for (const pos of Object.keys(RELEVANT)) {
      let rho = 0;
      for (const c of cases) {
        const outlook = weeklyOutlook(c.model, c.stats, c.league, c.week, params);
        const rows = Object.values(c.model.players)
          .filter((p) => p.pos === pos && c.actual.has(p.id) && !outlook.get(p.id)?.bye)
          .map((p) => ({ pred: outlook.get(p.id)!.pts, real: c.actual.get(p.id)! }))
          .sort((a, b) => b.pred - a.pred)
          .slice(0, RELEVANT[pos]);
        rho += spearman(
          rows.map((r) => r.pred),
          rows.map((r) => r.real),
        );
      }
      out[pos] = +(rho / cases.length).toFixed(3);
    }
    return out;
  };
  console.log("value only by position (top by prediction):", byPosition({ ...NFL.model }));
  console.log("sleeper only by position:", byPosition({ ...NFL.model, weekProjWeight: 1 }));

  const run = (params: ModelParams) => {
    let err = 0;
    let n = 0;
    let rho = 0;
    let groups = 0;
    for (const c of cases) {
      const outlook = weeklyOutlook(c.model, c.stats, c.league, c.week, params);
      for (const [pos, top] of Object.entries(RELEVANT)) {
        const rows = Object.values(c.model.players)
          .filter((p) => p.pos === pos && c.actual.has(p.id) && !outlook.get(p.id)?.bye)
          .map((p) => ({ pred: outlook.get(p.id)!.pts, real: c.actual.get(p.id)! }));
        const relevant = [...rows].sort((a, b) => b.pred - a.pred).slice(0, top);
        for (const r of relevant) err += Math.abs(r.pred - r.real);
        n += relevant.length;
        rho += spearman(
          relevant.map((r) => r.pred),
          relevant.map((r) => r.real),
        );
        groups++;
      }
    }
    return { mae: err / n, rank: rho / groups };
  };

  const results: { label: string; mae: number; rank: number }[] = [];
  const base = NFL.model;
  for (const matchupWeight of [0, 0.5, 1, 1.5])
    for (const matchupShrinkGames of [2, 4, 8])
      for (const weekProjWeight of [0, 0.25, 0.5, 0.75, 1])
        for (const similarWeight of [0, 0.5, 1]) {
          if (matchupWeight === 0 && matchupShrinkGames !== 4) continue;
          const params = {
            ...base,
            matchupWeight,
            matchupShrinkGames,
            weekProjWeight,
            similarWeight,
          };
          results.push({
            label: `matchup ${matchupWeight} shrink ${matchupShrinkGames} sleeper ${weekProjWeight} similar ${similarWeight}`,
            ...run(params),
          });
        }
  const pick = (label: string) => results.find((r) => r.label === label)!;
  results.sort((a, b) => a.mae - b.mae);
  const lines = [
    "# Week-ahead backtest",
    "",
    `Predict week N+1 from weeks 1..N, N = 3..16, ${SEASONS.join(" and ")}, half-PPR and PPR, over the top of each position by prediction (QB 24, RB 48, WR 60, TE 24). MAE in points (lower is better); rank = Spearman within position (higher is better).`,
    "",
    "| Model | MAE | Rank |",
    "|---|---|---|",
    ...[
      ["Value only", "matchup 0 shrink 4 sleeper 0 similar 0"],
      ["Sleeper weekly projection only", "matchup 0 shrink 4 sleeper 1 similar 0"],
    ].map(([name, label]) => {
      const r = pick(label!);
      return `| ${name} | ${r.mae.toFixed(3)} | ${r.rank.toFixed(3)} |`;
    }),
    ...results
      .slice(0, 10)
      .map((r) => `| ${r.label} | ${r.mae.toFixed(3)} | ${r.rank.toFixed(3)} |`),
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(new URL("../../../.cache/weekly-report.md", import.meta.url), report);
  console.log(report);
});
