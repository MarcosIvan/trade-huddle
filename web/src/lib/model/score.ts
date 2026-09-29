/**
 * Trade value and Player Score.
 *
 * Trade value, 1 to 40 (one decimal): what a player is worth in a trade, built from
 * several measures, each on a 0-1 scale that is comparable across positions:
 *
 *   base       15  what he has proven: preseason projection, or last season
 *   market     15  where drafters took him (ADP); fades as the season's games pile up
 *   expected   15  expected points per game from here on (the backtested model)
 *   season     10  points per game this season
 *   recent     10  points per game over the last 3 games
 *   edge       10  how far he is above the average starter at his position
 *   scarcity   10  points above a free agent at his position, relative to the league's best
 *   usage      15  his importance to his NFL offense (share of targets + carries)
 *
 * While the season has no more games than the recent window, "season" and
 * "recent" are the same games: they count once, at half weight, and the rest
 * goes to base, so three games cannot swing the value alone.
 * The sum is scaled by how scarce his position is in this league (mildly, so
 * positions stay comparable) and by his availability (injury or no team),
 * relative to the best player in the league (40). Every
 * player keeps at least 1: nobody is worth nothing in a trade.
 *
 * Player Score, 0 to 100, adds his importance to his fantasy team:
 *   80 points × trade value / 40 + 20 points × his value / the best value on his roster.
 * Team importance stays out of trade value because it changes with the owner:
 * a player must be worth the same on both sides of a trade.
 */
import type { SportConfig } from "../sports/types";
import type { Model, Player, StatsFile } from "./types";
import { USAGE_KEYS } from "./usage";
import { priorPpg } from "./value";

export interface TradeValueParts {
  base: number;
  market: number;
  expected: number;
  season: number;
  recent: number;
  edge: number;
  scarcity: number;
  usage: number;
}

export interface PlayerScore {
  total: number;
  /** Trade value, 1-40 with one decimal: owner-independent, used for trade fairness. */
  trade: number;
  /** Each measure of the trade value, 0 to 1. */
  parts: TradeValueParts;
  /** How scarce his position is in this league, 0 to 1. */
  posScale: number;
  /** Share of his value kept after injury or having no team, 0 to 1. */
  availability: number;
  /** His value relative to the best player on his fantasy roster, 0 to 1. */
  importance: number;
  /** 1-3 when he is one of his offense's three main weapons. */
  usageRank: number | null;
}

export const TRADE_VALUE_WEIGHTS = {
  base: 15,
  market: 15,
  expected: 15,
  season: 10,
  recent: 10,
  edge: 10,
  scarcity: 10,
  usage: 15,
} as const;

/** Top of the trade value scale (the league's best player). */
export const TRADE_VALUE_MAX = 40;

/** Player Score = `trade` points × trade value / TRADE_VALUE_MAX + `importance` points × team importance. */
export const SCORE_WEIGHTS = { trade: 80, importance: 20 } as const;

/** Share of team targets + carries that makes a lead player at each position. */
const LEAD_SHARE: Record<string, number> = { RB: 0.35, WR: 0.18, TE: 0.14 };
/** Recent games used for usage share. */
const USAGE_GAMES = 4;
/** Players averaged to find each position's elite level. */
const ELITE = 3;
/** Production ratios are raised to this power, so production gaps still count. */
const SPREAD = 1.5;
/** Steepness of the edge over the position's average starter (per standard deviation). */
const EDGE_SLOPE = 1.2;
/** Scarcity only moves trade value between this floor and 1, so positions stay comparable. */
const SCARCITY_FLOOR = 0.5;
/** Kickers and defenses are easy to replace. */
const MINOR_POSITION_SCALE = 0.3;
const MINOR_POSITIONS = new Set(["K", "DEF"]);
/** ADP at which the market score is one half (about the 4th round in 12-team leagues). */
const ADP_HALF = 40;
/** Steepness of the market score: early rounds are worth much more than late ones. */
const ADP_CURVE = 2;

/** An injured player keeps this share of the value his injury rule takes away (he comes back). */
const INJURY_RECOVERY = 0.4;

/** Each skill player's share of his team's targets + carries over his last games. */
export function usageShares(model: Model, stats: StatsFile): Map<string, number> {
  const tgt = stats.keys.indexOf(USAGE_KEYS[0]);
  const att = stats.keys.indexOf(USAGE_KEYS[1]);
  const shares = new Map<string, number>();
  for (const p of Object.values(model.players)) {
    if (!(p.pos in LEAD_SHARE) || !p.team) continue;
    const raw = stats.players[p.id];
    const weeks = Object.keys(raw?.w ?? {})
      .map(Number)
      .sort((a, b) => a - b)
      .slice(-USAGE_GAMES);
    let mine = 0;
    let team = 0;
    for (const w of weeks) {
      const club = raw?.tw?.[String(w)];
      const totals = club ? stats.team_weeks?.[club]?.[String(w)] : undefined;
      const packed = raw?.w?.[String(w)] ?? [];
      if (!totals) continue;
      for (let i = 0; i + 1 < packed.length; i += 2) {
        if (packed[i] === tgt || packed[i] === att) mine += packed[i + 1]!;
      }
      team += (totals[0] ?? 0) + (totals[1] ?? 0);
    }
    if (team > 0) shares.set(p.id, mine / team);
  }
  return shares;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Points per game he would score while healthy and on a team. */
const healthyPpg = (p: Player) => (p.injMult > 0 ? p.value / p.injMult : p.value);

/** How many players of each position start across the league (flex slots shared out). */
function startersByPos(model: Model, sport: SportConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of model.slots) {
    const el = sport.slotEligibility[slot] ?? [];
    for (const pos of el) out[pos] = (out[pos] ?? 0) + model.teams / el.length;
  }
  return out;
}

/** Share of a player's value kept after injury (he may come back) or having no team. */
function availability(p: Player, sport: SportConfig): number {
  const rule = p.inj ? sport.model.injury[p.inj] : undefined;
  const injury = rule ? 1 - (1 - INJURY_RECOVERY) * (1 - rule.mult) : 1;
  const noTeam = p.noTeam && sport.model.noTeamMult !== null ? sport.model.noTeamMult : 1;
  return injury * noTeam;
}

/** Trade value (1-40) and Player Score for every player. `rosters` gives each fantasy team's players. */
export function playerScores(
  model: Model,
  stats: StatsFile,
  rosters: readonly { playerIds: readonly string[] }[],
  sport: SportConfig,
): Map<string, PlayerScore> {
  const players = Object.values(model.players);
  const byPos = new Map<string, Player[]>();
  for (const p of players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p]);

  // Each position's elite level, starter average and spread, from healthy output.
  const starters = startersByPos(model, sport);
  const ref = new Map<string, { elite: number; avg: number; sd: number; eliteVorp: number }>();
  for (const [pos, list] of byPos) {
    const ppg = list.map(healthyPpg).sort((a, b) => b - a);
    const pool = ppg.slice(0, Math.max(ELITE, Math.round(starters[pos] ?? model.teams)));
    const avg = mean(pool);
    const sd = Math.sqrt(mean(pool.map((x) => (x - avg) ** 2))) || 1;
    const vorps = list.map((p) => p.vorp).sort((a, b) => b - a);
    ref.set(pos, {
      elite: Math.max(1e-9, mean(ppg.slice(0, ELITE))),
      avg,
      sd,
      eliteVorp: mean(vorps.slice(0, ELITE)),
    });
  }

  // Scarcity: how far the position's elite stands above replacement, relative to the scarcest.
  const topVorp = Math.max(
    1e-9,
    ...[...ref].filter(([pos]) => !MINOR_POSITIONS.has(pos)).map(([, r]) => r.eliteVorp),
  );
  const posScale = (pos: string) =>
    MINOR_POSITIONS.has(pos)
      ? MINOR_POSITION_SCALE
      : SCARCITY_FLOOR + (1 - SCARCITY_FLOOR) * clamp01((ref.get(pos)?.eliteVorp ?? 0) / topVorp);

  // Usage: share of targets + carries relative to a lead player; top three weapons per offense.
  const shares = usageShares(model, stats);
  const usageRank = new Map<string, number>();
  const byTeam = new Map<string, { id: string; norm: number }[]>();
  for (const [id, share] of shares) {
    const p = model.players[id]!;
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), { id, norm: share / LEAD_SHARE[p.pos]! }]);
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => b.norm - a.norm);
    list.slice(0, 3).forEach(({ id }, i) => usageRank.set(id, i + 1));
  }

  // Points above a free agent while healthy, relative to the best in the league.
  const healthyVorp = (p: Player) => Math.max(0, healthyPpg(p) - (model.repl[p.pos] ?? 0));
  const bestVorp = Math.max(1e-9, ...players.map(healthyVorp));

  const raw = new Map<string, { value: number; parts: TradeValueParts; avail: number }>();
  for (const p of players) {
    const r = ref.get(p.pos)!;
    const production = (ppg: number) => clamp01(Math.max(0, ppg) / r.elite) ** SPREAD;
    const expected = healthyPpg(p);
    const season = p.seasonAvg ?? expected;
    const recent = p.lastAvg ?? season;
    const share = shares.get(p.id);
    const adp = model.adpFormat ? stats.players[p.id]?.adp?.[model.adpFormat] : undefined;
    const parts: TradeValueParts = {
      base: production(priorPpg(p, sport.model) ?? expected),
      market: adp === undefined ? 0 : 1 / (1 + (adp / ADP_HALF) ** ADP_CURVE),
      expected: production(expected),
      season: production(season),
      recent: production(recent),
      edge: 1 / (1 + Math.exp((-EDGE_SLOPE * (expected - r.avg)) / r.sd)),
      scarcity: Math.sqrt(healthyVorp(p) / bestVorp),
      // Positions without a usage share (QB, K, DEF) use their expected production instead.
      usage: share === undefined ? production(expected) : clamp01(share / LEAD_SHARE[p.pos]!),
    };
    const w: Record<keyof TradeValueParts, number> = { ...TRADE_VALUE_WEIGHTS };
    // The draft market fades like the prior does (k / (k + games)); the rest goes to expected.
    const k = sport.model.prevReliabilityGames || 8;
    const marketW = adp === undefined ? 0 : (w.market * k) / (k + p.g);
    w.expected += w.market - marketW;
    w.market = marketW;
    if (p.g <= sport.model.recentGames) {
      // Same games in both: count them once, the rest goes to what he has proven.
      w.base += w.recent + w.season / 2;
      w.season /= 2;
      w.recent = 0;
    }
    const sum = (Object.keys(w) as (keyof TradeValueParts)[]).reduce(
      (s, k) => s + w[k] * parts[k],
      0,
    );
    const avail = availability(p, sport);
    raw.set(p.id, { value: (sum / 100) * posScale(p.pos) * avail, parts, avail });
  }
  const best = Math.max(1e-9, ...[...raw.values()].map((r) => r.value));

  // Importance: value relative to the best player on the same fantasy roster.
  const importance = new Map<string, number>();
  for (const r of rosters) {
    const mine = r.playerIds.flatMap((id) => (model.players[id] ? [model.players[id]] : []));
    const top = Math.max(1e-9, ...mine.map((p) => p.value));
    for (const p of mine) importance.set(p.id, p.value / top);
  }

  const out = new Map<string, PlayerScore>();
  for (const p of players) {
    const r = raw.get(p.id)!;
    // One decimal: players can tie, and nobody goes below 1.
    const trade = Math.max(1, Math.round((10 * TRADE_VALUE_MAX * r.value) / best) / 10);
    const imp = importance.get(p.id) ?? 0;
    out.set(p.id, {
      total: Math.min(
        100,
        (SCORE_WEIGHTS.trade * trade) / TRADE_VALUE_MAX + SCORE_WEIGHTS.importance * imp,
      ),
      trade,
      parts: r.parts,
      posScale: posScale(p.pos),
      availability: r.avail,
      importance: imp,
      usageRank: usageRank.get(p.id) ?? null,
    });
  }
  return out;
}
