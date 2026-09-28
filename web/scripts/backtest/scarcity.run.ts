/**
 * Calibrates positional scarcity (bench depth per position) against the draft
 * market.
 *
 * Preseason, every player's expected points are Sleeper's projection, so the
 * only thing that decides how our trade value ranks players of different
 * positions is scarcity. The market's ADP encodes how leagues actually trade
 * off positions, which is what matters for a trade to be accepted. The search
 * finds the bench depths whose trade-value ranking best matches ADP.
 *
 *   npm run backtest:scarcity   (needs past seasons in .cache/seasons)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildModel, type StatsFile, type StatsPlayer } from "../../src/lib/model";
import { NFL } from "../../src/lib/sports/nfl";
import type { ModelParams } from "../../src/lib/sports/types";
import { BENCHMARK_LEAGUES } from "./leagues";

const FILES = [
  ["2024", "../../../.cache/seasons/nfl-2024.json"],
  ["2025", "../../../.cache/seasons/nfl-2025.json"],
  ["2026", "../../public/data/nfl/stats.json"],
] as const;
/** Which ADP to compare with in each benchmark league. */
const ADP_FORMAT: Record<string, string> = { "half-PPR": "half", PPR: "ppr" };
const TOP = 150;
const POSITIONS = ["QB", "RB", "WR", "TE"];

/** A preseason view: last season is replaced by the projection; no games yet. */
function preseason(stats: StatsFile): StatsFile {
  const games = stats.season_games ?? 17;
  const players: Record<string, StatsPlayer> = {};
  for (const [id, p] of Object.entries(stats.players)) {
    if (!p.proj) continue;
    players[id] = { ...p, prev: { g: games, s: p.proj }, w: undefined, i: undefined };
  }
  return { ...stats, weeks: [], players };
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(values.length);
  order.forEach(([, i], k) => (r[i] = k));
  return r;
}

function spearman(a: number[], b: number[]): number {
  const n = a.length;
  const ra = ranks(a);
  const rb = ranks(b);
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

interface Fit {
  rho: number;
  mix: Record<string, number>;
}

function fit(stats: StatsFile, params: ModelParams): Fit {
  let rhoSum = 0;
  const mix: Record<string, number> = {};
  const leagues = Object.entries(BENCHMARK_LEAGUES);
  for (const [name, league] of leagues) {
    const format = ADP_FORMAT[name]!;
    const model = buildModel(stats, league, { ...NFL, model: params });
    const rows = Object.values(model.players)
      .filter((p) => POSITIONS.includes(p.pos))
      .map((p) => ({ pos: p.pos, vorp: p.vorp, adp: stats.players[p.id]?.adp?.[format] }))
      .filter(
        (r): r is { pos: string; vorp: number; adp: number } => r.adp !== undefined && r.adp <= TOP,
      );
    // Higher trade value should mean an earlier pick (lower ADP).
    rhoSum += spearman(
      rows.map((r) => -r.vorp),
      rows.map((r) => r.adp),
    );
    for (const r of [...rows].sort((a, b) => b.vorp - a.vorp).slice(0, 36)) {
      mix[r.pos] = (mix[r.pos] ?? 0) + 1 / leagues.length;
    }
  }
  return { rho: rhoSum / leagues.length, mix };
}

function marketMix(stats: StatsFile): Record<string, number> {
  const mix: Record<string, number> = {};
  Object.values(stats.players)
    .filter((p) => p.adp?.half !== undefined && POSITIONS.includes(p.p ?? ""))
    .sort((a, b) => a.adp!.half! - b.adp!.half!)
    .slice(0, 36)
    .forEach((p) => (mix[p.p!] = (mix[p.p!] ?? 0) + 1));
  return mix;
}

const fmtMix = (m: Record<string, number>) =>
  POSITIONS.map((p) => `${p} ${Math.round(m[p] ?? 0)}`).join(", ");

it("scarcity", { timeout: 60 * 60 * 1000 }, () => {
  const data = FILES.flatMap(([season, path]) => {
    const url = new URL(path, import.meta.url);
    return existsSync(url)
      ? [[season, preseason(JSON.parse(readFileSync(url, "utf8")) as StatsFile)] as const]
      : [];
  });
  if (!data.length) {
    console.log("No seasons found. Build them with the pipeline first.");
    return;
  }

  const evaluate = (depth: Record<string, number>) => {
    const params: ModelParams = { ...NFL.model, benchDepth: depth };
    const fits = data.map(([season, stats]) => [season, fit(stats, params)] as const);
    return { depth, fits, rho: fits.reduce((s, [, f]) => s + f.rho, 0) / fits.length };
  };

  const results = [];
  for (const RB of [0, 0.5, 1, 1.5, 2, 2.5, 3])
    for (const WR of [0, 0.5, 1, 1.5, 2, 2.5])
      for (const TE of [0, 0.25, 0.5, 1])
        for (const QB of [0, 0.25, 0.5, 1]) results.push(evaluate({ QB, RB, WR, TE }));
  results.sort((a, b) => b.rho - a.rho);

  const none = evaluate({});
  const lines = [
    "# Scarcity calibration against ADP",
    "",
    `Spearman correlation between preseason trade value and ADP (top ${TOP}, QB/RB/WR/TE), ` +
      `averaged over ${data.map(([s]) => s).join(", ")} and half-PPR/PPR. ${results.length} settings.`,
    "",
    "| Bench depth per team | Correlation | Top-36 mix (ours, per season) |",
    "|---|---|---|",
    `| none | ${none.rho.toFixed(3)} | ${none.fits.map(([s, f]) => `${s}: ${fmtMix(f.mix)}`).join("; ")} |`,
    ...results
      .slice(0, 10)
      .map(
        (r) =>
          `| ${POSITIONS.map((p) => `${p} ${r.depth[p]}`).join(", ")} | ${r.rho.toFixed(3)} | ${r.fits.map(([s, f]) => `${s}: ${fmtMix(f.mix)}`).join("; ")} |`,
      ),
    "",
    `Market top 36 (half-PPR ADP): ${data.map(([s, stats]) => `${s}: ${fmtMix(marketMix(stats))}`).join("; ")}`,
  ];
  const report = lines.join("\n") + "\n";
  writeFileSync(new URL("../../../.cache/scarcity-report.md", import.meta.url), report);
  console.log(report);
});
