/**
 * Player Score, 0 to 100: one readable number for how much a player matters.
 *
 *   level       50  trade value (points above replacement, so positional
 *                   scarcity is included), relative to the best in the league
 *   form        30  recent output above replacement, relative to the best
 *   importance  20  his value relative to the best player on his fantasy team
 *   usage bonus +10 at most: one of the three main weapons of his NFL offense
 *                   (share of the team's targets and carries), 1st > 2nd > 3rd
 *
 * The "trade score" leaves out importance, which depends on who owns the
 * player: the same player must be worth the same on both sides of a trade.
 */
import type { Model, Player, StatsFile } from "./types";
import { USAGE_KEYS } from "./usage";

export interface PlayerScore {
  total: number;
  /** Owner-independent part, used for trade fairness (level + form + usage). */
  trade: number;
  level: number;
  form: number;
  importance: number;
  usage: number;
  /** 1-3 when he is one of his offense's three main weapons. */
  usageRank: number | null;
}

export const SCORE_WEIGHTS = { level: 50, form: 30, importance: 20, usage: 10 } as const;

/** Share of team targets + carries that makes a lead player at each position. */
const LEAD_SHARE: Record<string, number> = { RB: 0.35, WR: 0.18, TE: 0.14 };
/** Usage bonus for the 1st, 2nd and 3rd weapon of an offense. */
const RANK_BONUS = [1, 0.7, 0.45];
/** Recent games used for usage share. */
const USAGE_GAMES = 4;

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

/** Scores for every player in the model. `rosters` gives each fantasy team's players. */
export function playerScores(
  model: Model,
  stats: StatsFile,
  rosters: readonly { playerIds: readonly string[] }[],
): Map<string, PlayerScore> {
  const players = Object.values(model.players);
  const formAbove = (p: Player) => {
    const recent = p.lastAvg ?? p.seasonAvg;
    const pts = recent === null ? p.value : recent * p.injMult;
    return Math.max(0, pts - (model.repl[p.pos] ?? 0));
  };
  const maxVorp = Math.max(1e-9, ...players.map((p) => p.vorp));
  const maxForm = Math.max(1e-9, ...players.map(formAbove));

  // Importance: value relative to the best player on the same fantasy roster.
  const importance = new Map<string, number>();
  for (const r of rosters) {
    const mine = r.playerIds.flatMap((id) => (model.players[id] ? [model.players[id]] : []));
    const best = Math.max(1e-9, ...mine.map((p) => p.value));
    for (const p of mine) importance.set(p.id, p.value / best);
  }

  // Usage bonus: top three weapons of each NFL offense, by share relative to a lead player.
  const shares = usageShares(model, stats);
  const byTeam = new Map<string, { id: string; norm: number }[]>();
  for (const [id, share] of shares) {
    const p = model.players[id]!;
    const norm = share / (LEAD_SHARE[p.pos] ?? 1);
    byTeam.set(p.team, [...(byTeam.get(p.team) ?? []), { id, norm }]);
  }
  const usage = new Map<string, { bonus: number; rank: number }>();
  for (const list of byTeam.values()) {
    list.sort((a, b) => b.norm - a.norm);
    list.slice(0, RANK_BONUS.length).forEach(({ id, norm }, i) => {
      usage.set(id, { bonus: RANK_BONUS[i]! * Math.min(1, norm), rank: i + 1 });
    });
  }

  const out = new Map<string, PlayerScore>();
  for (const p of players) {
    const level = Math.min(1, p.vorp / maxVorp);
    const form = Math.min(1, formAbove(p) / maxForm);
    const imp = importance.get(p.id) ?? 0;
    const u = usage.get(p.id);
    const usagePts = (u?.bonus ?? 0) * SCORE_WEIGHTS.usage;
    const trade = SCORE_WEIGHTS.level * level + SCORE_WEIGHTS.form * form + usagePts;
    out.set(p.id, {
      total: Math.min(100, trade + SCORE_WEIGHTS.importance * imp),
      trade,
      level,
      form,
      importance: imp,
      usage: usagePts,
      usageRank: u?.rank ?? null,
    });
  }
  return out;
}
