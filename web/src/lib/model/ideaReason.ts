/**
 * Why a trade idea helps: for each side, where it climbs among the league's
 * teams (at a position, or else with its whole starting lineup); for you,
 * also what the deal costs at a position you send. Position ranks use the
 * same strength as the teams' needs (the best players each lineup starts at
 * a position); the lineup rank uses the best lineup's points per game. In
 * the NBA most gains come through flexible slots, so the lineup rank often
 * tells the story there.
 */
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { positionRank, positionStrength } from "./positionStrength";
import { positionNeeds, type TeamRoster } from "./trades";
import type { Model, Player } from "./types";

/**
 * A team's rank before and after a trade (1 is the strongest), at a position
 * or, with `pos` null, by its whole starting lineup.
 */
export interface RankMove {
  pos: string | null;
  from: number;
  to: number;
}

export interface IdeaReason {
  /** Teams in the league: ranks run from 1 to this. */
  teams: number;
  /** Where you gain most, and where you pay for it (null when nothing weakens). */
  mine: { up: RankMove | null; cost: RankMove | null };
  /** Where the partner gains most, and where it loses most (said only when it gains nowhere). */
  theirs: { up: RankMove | null; cost: RankMove | null };
}

/** Strength changes smaller than this (points per game) are noise. */
const EPSILON = 0.005;

/** The key of the whole starting lineup among the positions. */
const LINEUP = "*";

interface Move extends RankMove {
  /** Strength after minus before, in points per game. */
  change: number;
}

function moves(
  before: ReadonlyMap<number, Readonly<Record<string, number>>>,
  after: ReadonlyMap<number, Readonly<Record<string, number>>>,
  rid: number,
  positions: ReadonlySet<string>,
): Move[] {
  const out: Move[] = [];
  for (const pos of positions) {
    const was = before.get(rid)?.[pos];
    const now = after.get(rid)?.[pos];
    if (was === undefined || now === undefined) continue;
    out.push({
      pos: pos === LINEUP ? null : pos,
      from: positionRank(before, rid, pos),
      to: positionRank(after, rid, pos),
      change: now - was,
    });
  }
  return out;
}

const plain = (m: Move | undefined): RankMove | null =>
  m ? { pos: m.pos, from: m.from, to: m.to } : null;

const climb = (m: Move) => m.from - m.to;

/**
 * The biggest gain, in this order: the position that climbs most in rank,
 * the whole lineup climbing, the position that gains most without climbing,
 * the whole lineup gaining without climbing.
 */
function biggestGain(list: readonly Move[]): RankMove | null {
  const gains = list.filter((m) => m.change > EPSILON);
  const order = (m: Move) => (climb(m) > 0 ? 0 : 2) + (m.pos === null ? 1 : 0);
  gains.sort((a, b) => order(a) - order(b) || climb(b) - climb(a) || b.change - a.change);
  return plain(gains[0]);
}

/** The position that falls most in rank, then loses most in strength. */
function biggestLoss(list: readonly Move[]): RankMove | null {
  const losses = list.filter((m) => m.pos !== null && m.change < -EPSILON);
  losses.sort((a, b) => b.to - b.from - (a.to - a.from) || a.change - b.change);
  return plain(losses[0]);
}

/**
 * The reason behind a trade: you send `give` to `partner` and get `get`.
 * Only the positions of the players who move are considered.
 */
export function ideaReason(
  give: readonly Player[],
  get: readonly Player[],
  myRid: number,
  partner: number,
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
): IdeaReason {
  const { min } = positionNeeds(model.slots, sport);
  const strength = (list: readonly Player[]) => ({
    ...positionStrength(list, min),
    [LINEUP]: bestLineup(list, model.slots, sport).total,
  });
  const before = new Map(rosters.map((t) => [t.rid, strength(t.players)]));
  const after = new Map(before);
  const moved = new Set([...give, ...get].map((p) => p.id));
  for (const t of rosters) {
    if (t.rid !== myRid && t.rid !== partner) continue;
    const incoming = t.rid === myRid ? get : give;
    const kept = t.players.filter((p) => !moved.has(p.id));
    after.set(t.rid, strength([...kept, ...incoming]));
  }
  const positions = new Set([...give, ...get].map((p) => p.pos).concat(LINEUP));
  const mine = moves(before, after, myRid, positions);
  const theirs = moves(before, after, partner, positions);
  return {
    teams: rosters.length,
    mine: { up: biggestGain(mine), cost: biggestLoss(mine) },
    theirs: { up: biggestGain(theirs), cost: biggestLoss(theirs) },
  };
}

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd… */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

const gainWords = (who: "You" | "they", up: RankMove | null): string => {
  if (!up) return `${who} add depth`;
  const where = up.pos === null ? "in starting lineups" : `at ${up.pos}`;
  if (up.to < up.from) return `${who} go from ${ordinal(up.from)} to ${ordinal(up.to)} ${where}`;
  const what = up.pos ?? (who === "You" ? "your lineup" : "their lineup");
  return `${who} strengthen ${what} (still ${ordinal(up.to)})`;
};

const costWords = (up: RankMove | null, cost: RankMove | null): string => {
  if (!cost) return up ? " without weakening another position" : "";
  if (cost.to > cost.from) {
    return ` and drop from ${ordinal(cost.from)} to ${ordinal(cost.to)} at ${cost.pos}`;
  }
  return ` and stay ${ordinal(cost.to)} at ${cost.pos}`;
};

/**
 * The reason in one sentence, e.g. "You go from 11th to 4th at TE and stay
 * 2nd at RB; they go from 9th to 3rd at RB." or "You go from 7th to 5th in
 * starting lineups and stay 2nd at C; they strengthen PG (still 3rd)."
 */
export function reasonText(r: IdeaReason): string {
  const me = gainWords("You", r.mine.up) + costWords(r.mine.up, r.mine.cost);
  const { up, cost } = r.theirs;
  // A partner that gains nowhere and gets weaker somewhere is told so, not "adds depth".
  const them =
    !up && cost && cost.pos !== null
      ? cost.to > cost.from
        ? `they drop from ${ordinal(cost.from)} to ${ordinal(cost.to)} at ${cost.pos}`
        : `they weaken ${cost.pos} (still ${ordinal(cost.to)})`
      : gainWords("they", up);
  return `${me}; ${them}.`;
}

/** Ideas with their reason attached. */
export function withReasons<T extends { give: Player[]; get: Player[]; partner: number }>(
  ideas: readonly T[],
  myRid: number,
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
): (T & { reason: IdeaReason })[] {
  return ideas.map((idea) => ({
    ...idea,
    reason: ideaReason(idea.give, idea.get, myRid, idea.partner, rosters, model, sport),
  }));
}
