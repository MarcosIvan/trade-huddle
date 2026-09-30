/**
 * Backtest: how well does the value model predict the rest of a season?
 *
 * For a past season and a checkpoint week N, the model sees only weeks 1..N
 * (plus the season before) and predicts each player's points per game. The
 * prediction is compared with what the player actually averaged in the games
 * he played after week N.
 */
import { buildModel, makeScorer, type LeagueSettings, type StatsFile } from "../../src/lib/model";
import type { ModelParams, SportConfig } from "../../src/lib/sports/types";

export interface Metrics {
  /** Mean absolute error, points per game. */
  mae: number;
  /** Spearman rank correlation inside each position, averaged. */
  rank: number;
  n: number;
}

/**
 * The stats file as it looked after week N. Past seasons have no injury
 * report, so one is emulated: a player who missed week N but plays again
 * later is listed as "Questionable" (expected back; no value penalty).
 */
export function truncate(stats: StatsFile, week: number): StatsFile {
  const players = Object.fromEntries(
    Object.entries(stats.players).map(([id, p]) => {
      const w = p.w
        ? Object.fromEntries(Object.entries(p.w).filter(([wk]) => Number(wk) <= week))
        : undefined;
      // Only the next week's projection existed then; later ones were made later.
      const wp = p.wp?.[String(week + 1)]
        ? { [String(week + 1)]: p.wp[String(week + 1)]! }
        : undefined;
      const tw = p.tw
        ? Object.fromEntries(Object.entries(p.tw).filter(([wk]) => Number(wk) <= week))
        : undefined;
      const playedBefore = Object.keys(w ?? {}).length > 0;
      const missedLast = !p.w?.[week];
      const returnsLater = Object.keys(p.w ?? {}).some((wk) => Number(wk) > week);
      const i = playedBefore && missedLast && returnsLater ? "Questionable" : p.i;
      return [id, { ...p, w, tw, i, wp }];
    }),
  );
  return {
    ...stats,
    weeks: stats.weeks.filter((w) => w <= week),
    lineup_week: week + 1,
    players,
  };
}

/** Actual points per game after week N, for players with enough games left. */
export function actualAfter(
  stats: StatsFile,
  league: LeagueSettings,
  week: number,
  minGames: number,
): Map<string, number> {
  const score = makeScorer(stats.keys, league.scoring_settings);
  const out = new Map<string, number>();
  for (const [id, p] of Object.entries(stats.players)) {
    const later = Object.entries(p.w ?? {})
      .filter(([wk]) => Number(wk) > week)
      .map(([, packed]) => score(packed));
    if (later.length >= minGames) out.set(id, later.reduce((s, x) => s + x, 0) / later.length);
  }
  return out;
}

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
  const d2 = ra.reduce((s, r, i) => s + (r - rb[i]!) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/** How many players per position matter: roughly the starters plus a bench's worth. */
const RELEVANT: Record<string, number> = { QB: 24, RB: 48, WR: 60, TE: 24 };

export function evaluate(
  stats: StatsFile,
  league: LeagueSettings,
  sport: SportConfig,
  params: ModelParams,
  week: number,
): Metrics {
  const model = buildModel(truncate(stats, week), league, { ...sport, model: params });
  const actual = actualAfter(stats, league, week, 4);
  let errSum = 0;
  let n = 0;
  const rankScores: number[] = [];
  for (const [pos, top] of Object.entries(RELEVANT)) {
    // Relevant: in the top of the position by prediction or by what really happened.
    const rows = Object.values(model.players)
      .filter((p) => p.pos === pos && actual.has(p.id))
      .map((p) => ({ pred: p.value, real: actual.get(p.id)! }));
    const byPred = new Set([...rows].sort((a, b) => b.pred - a.pred).slice(0, top));
    const byReal = new Set([...rows].sort((a, b) => b.real - a.real).slice(0, top));
    const relevant = rows.filter((r) => byPred.has(r) || byReal.has(r));
    for (const r of relevant) errSum += Math.abs(r.pred - r.real);
    n += relevant.length;
    rankScores.push(
      spearman(
        relevant.map((r) => r.pred),
        relevant.map((r) => r.real),
      ),
    );
  }
  return {
    mae: n ? errSum / n : 0,
    rank: rankScores.reduce((s, x) => s + x, 0) / rankScores.length,
    n,
  };
}
