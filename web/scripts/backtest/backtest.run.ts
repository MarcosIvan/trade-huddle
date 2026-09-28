/**
 * Runs the backtest over past seasons built by the pipeline:
 *
 *   .venv/bin/python -m trade_huddle_data build --season 2025   (and 2024)
 *   npm run backtest
 *
 * Writes a Markdown report to ../.cache/backtest-report.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import type { StatsFile } from "../../src/lib/model";
import { NFL, PROTOTYPE_MODEL } from "../../src/lib/sports/nfl";
import type { ModelParams } from "../../src/lib/sports/types";
import { evaluate, type Metrics } from "./evaluate";
import { BENCHMARK_LEAGUES } from "./leagues";

const SEASONS = ["2024", "2025"];
const CHECKPOINTS = [1, 2, 3, 4, 6, 8, 10, 12];
const CACHE = new URL("../../../.cache/", import.meta.url);

function load(season: string): StatsFile | null {
  const file = new URL(`seasons/nfl-${season}.json`, CACHE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as StatsFile) : null;
}

interface Result {
  label: string;
  params: ModelParams;
  mae: number;
  rank: number;
  byWeek: Map<number, Metrics>;
}

function run(label: string, params: ModelParams, data: [string, StatsFile][]): Result {
  const byWeek = new Map<number, { mae: number; rank: number; n: number; runs: number }>();
  for (const [, stats] of data) {
    for (const league of Object.values(BENCHMARK_LEAGUES)) {
      for (const week of CHECKPOINTS) {
        const m = evaluate(stats, league, NFL, params, week);
        const acc = byWeek.get(week) ?? { mae: 0, rank: 0, n: 0, runs: 0 };
        byWeek.set(week, {
          mae: acc.mae + m.mae,
          rank: acc.rank + m.rank,
          n: acc.n + m.n,
          runs: acc.runs + 1,
        });
      }
    }
  }
  const weeks = new Map(
    [...byWeek].map(([w, a]) => [
      w,
      { mae: a.mae / a.runs, rank: a.rank / a.runs, n: a.n / a.runs },
    ]),
  );
  const all = [...weeks.values()];
  return {
    label,
    params,
    mae: all.reduce((s, m) => s + m.mae, 0) / all.length,
    rank: all.reduce((s, m) => s + m.rank, 0) / all.length,
    byWeek: weeks,
  };
}

const base: ModelParams = PROTOTYPE_MODEL;

/** Naive references: what a model has to beat to be worth anything. */
const REFERENCES: [string, ModelParams][] = [
  ["Prototype", base],
  ["Calibrated (live settings)", NFL.model],
  ["Only last season", { ...base, wPrevStart: 1, wPrevDecay: 0, wPrevMin: 1, recentShare: 0 }],
  ["Only this season", { ...base, wPrevStart: 0, wPrevDecay: 0, wPrevMin: 0, recentShare: 0 }],
];

function* grid(): Generator<[string, ModelParams]> {
  for (const k of [2, 3, 4, 6])
    for (const start of [0.8, 1])
      for (const cap of [0])
        for (const usage of [0.4, 0.5, 0.6, 0.7, 0.85])
          for (const recentShare of [0.15, 0.3, 0.45])
            for (const recentAfterWindow of [true, false]) {
              const params: ModelParams = {
                ...base,
                prevReliabilityGames: k,
                wPrevStart: start,
                wPrevMin: 0,
                outlierCap: cap,
                usageBlend: usage,
                recentShare,
                recentAfterWindow,
              };
              yield [
                `k=${k} start=${start} usage=${usage} recent=${recentShare}${recentAfterWindow ? "" : " (recent always)"}`,
                params,
              ];
            }
}

const f = (x: number, d = 3) => x.toFixed(d);

it("backtest", { timeout: 60 * 60 * 1000 }, () => {
  const data = SEASONS.flatMap((s) => {
    const stats = load(s);
    return stats ? [[s, stats] as [string, StatsFile]] : [];
  });
  if (!data.length) {
    console.log("No past seasons in .cache/seasons. Build them with the pipeline first.");
    return;
  }

  const references = REFERENCES.map(([label, p]) => run(label, p, data));
  const searched = [...grid()].map(([label, p]) => run(label, p, data));
  searched.sort((a, b) => a.mae - b.mae);
  const best = searched.slice(0, 10);

  const lines: string[] = [];
  lines.push(`# Backtest report`, "");
  lines.push(
    `Seasons ${data.map(([s]) => s).join(", ")}; leagues ${Object.keys(BENCHMARK_LEAGUES).join(", ")}; ` +
      `checkpoints after weeks ${CHECKPOINTS.join(", ")}. MAE in points per game (lower is better); ` +
      `rank = Spearman correlation within position (higher is better). ${searched.length} settings searched.`,
    "",
  );
  lines.push("| Model | MAE | Rank |", "|---|---|---|");
  for (const r of [...references, ...best])
    lines.push(`| ${r.label} | ${f(r.mae)} | ${f(r.rank)} |`);
  lines.push("", "## By checkpoint (MAE / rank)", "");
  const shown = [...references, best[0]!];
  lines.push(`| After week | ${shown.map((r) => r.label).join(" | ")} |`);
  lines.push(`|---|${shown.map(() => "---").join("|")}|`);
  for (const w of CHECKPOINTS) {
    lines.push(
      `| ${w} | ${shown.map((r) => `${f(r.byWeek.get(w)!.mae, 2)} / ${f(r.byWeek.get(w)!.rank, 2)}`).join(" | ")} |`,
    );
  }
  const report = lines.join("\n") + "\n";
  writeFileSync(new URL("backtest-report.md", CACHE), report);
  console.log(report);
});
