import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import type { FreeAgent, Model, Player, Valued } from "./types";

export interface TradeResult {
  give: Player[];
  get: Player[];
  /** Open roster spots you fill from free agency (you send more players than you get). */
  myOpen: number;
  /** Open roster spots the partner fills from free agency. */
  theirOpen: number;
  meBefore: number;
  meAfter: number;
  dMe: number;
  themBefore: number;
  themAfter: number;
  dThem: number;
  /** Value above replacement you send. */
  vGive: number;
  /** Value above replacement you get. */
  vGet: number;
  /** Smaller side / larger side, in value above replacement (1 = even). */
  fairness: number;
  /**
   * Trade value you send and get, when trade values are known (otherwise value
   * above replacement). Each side's best player counts in full, the next ones
   * less (see SIDE_DEPTH): two good players do not add up to a star.
   */
  sGive: number;
  sGet: number;
  /** Your roster's positions still work: nothing left short, nothing piled up. */
  positionsOk: boolean;
  /** The partner's roster positions still work. */
  theirPositionsOk: boolean;
  /** Share of the players you send whose position you refill or have spare, 0 to 1. */
  positionFit: number;
  /** What the trade leaves wrong on your roster, in words (empty when fine). */
  warnings: string[];
  /**
   * How well the deal fits each side's needs, 0 to 1: the best player you get
   * plays where you are weak, the best player you send plays where you are
   * strong. 0.5 when needs are unknown.
   */
  myNeedFit: number;
  theirNeedFit: number;
  /** The position of the best player you get, when your lineup is weak there. */
  myNeedPos: string | null;
  /** The position of the best player the partner gets, when their lineup is weak there. */
  theirNeedPos: string | null;
  /** Share of the trade score you send that comes from players outside your starting lineup. */
  benchShare: number;
  /** How evenly the trade helps both lineups: smaller gain / larger gain (0 when either loses). */
  balance: number;
  /** Overall match quality, 0 to 1: fairness, balance of gains and bench players sent. */
  match: number;
  /** Free agents you would add to fill your open spots. */
  myPickups: Valued[];
  /** Free agents the partner would add to fill theirs. */
  theirPickups: Valued[];
}

export interface TradeIdea extends TradeResult {
  partner: number;
  score: number;
}

/** A team's roster, as model players. */
export interface TeamRoster {
  rid: number;
  players: readonly Player[];
}

/** A replacement-level placeholder for an open roster spot, when no real free agent is known. */
export function freeAgent(model: Model, pos: string, n = 1): FreeAgent {
  return {
    id: n > 1 ? `fa-${pos}-${n}` : `fa-${pos}`,
    name: `Free agent (${pos})`,
    pos,
    elig: [pos],
    value: model.repl[pos] ?? 0,
    vorp: 0,
    startable: true,
    freeAgent: true,
  };
}

/** The league's real free agents by position, best first. */
export type FreeAgentPool = ReadonlyMap<string, readonly Player[]>;

/**
 * Players on no roster in the league who could actually help: on an NFL team,
 * able to play, and with some evidence (games, last season or a projection).
 */
export function freeAgentPool(model: Model, rostered: ReadonlySet<string>): FreeAgentPool {
  const pool = new Map<string, Player[]>();
  for (const p of Object.values(model.players)) {
    if (rostered.has(p.id) || !p.startable || p.noTeam || p.value <= 0) continue;
    if (p.g === 0 && p.prevG === 0 && p.projPpg === null) continue;
    pool.set(p.pos, [...(pool.get(p.pos) ?? []), p]);
  }
  for (const list of pool.values()) list.sort((a, b) => b.value - a.value);
  return pool;
}

/**
 * Fills open roster spots with the free agent that helps the lineup most: the
 * best real free agent at each position when a pool is given, otherwise a
 * replacement-level placeholder. `taken` keeps both teams from adding the same
 * player.
 */
export function withFreeAgents(
  list: readonly Valued[],
  open: number,
  model: Model,
  sport: SportConfig,
  pool?: FreeAgentPool,
  taken: Set<string> = new Set(),
): { list: readonly Valued[]; added: Valued[] } {
  let current = list;
  const added: Valued[] = [];
  for (let n = 1; n <= open; n++) {
    let best: Valued | null = null;
    let bestTotal = -1;
    for (const pos of sport.freeAgentPositions) {
      const real = pool?.get(pos)?.find((p) => !taken.has(p.id));
      const candidate = real ?? freeAgent(model, pos, n);
      const total = bestLineup(current.concat(candidate), model.slots, sport).total;
      if (total > bestTotal) {
        bestTotal = total;
        best = candidate;
      }
    }
    if (!best) break;
    taken.add(best.id);
    added.push(best);
    current = current.concat(best);
  }
  return { list: current, added };
}

const sumVorp = (list: readonly Valued[]) => list.reduce((s, p) => s + p.vorp, 0);

/** Weight of each player on a side of a trade, best first: extra players count less. */
export const SIDE_DEPTH = [1, 0.85, 0.7] as const;

/** A side's trade value: best player in full, the next ones discounted. */
export function sideValue(values: readonly number[]): number {
  return [...values]
    .sort((a, b) => b - a)
    .reduce((s, v, i) => s + v * (SIDE_DEPTH[i] ?? SIDE_DEPTH[SIDE_DEPTH.length - 1]!), 0);
}

/**
 * Weights of the match quality: fairness first, then both teams gaining alike,
 * each side getting what it needs, positions refilled, bench players sent.
 */
export const MATCH = { fairness: 0.35, balance: 0.2, need: 0.2, fit: 0.1, bench: 0.15 } as const;

/** Need per position, 0 (the league's strongest there) to 1 (the weakest). */
export type TeamNeeds = Readonly<Record<string, number>>;

/** A need at or above this counts as "needs a player there" (bottom half of the league). */
export const NEED_THRESHOLD = 0.5;

/**
 * How much each team needs each position: the average value of its best
 * players there (as many as its lineup starts, plus the flex backup at RB
 * and WR), ranked against the other teams.
 */
export function teamNeeds(
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
): Map<number, TeamNeeds> {
  const { min } = positionNeeds(model.slots, sport);
  const strength = new Map<number, Record<string, number>>();
  for (const t of rosters) {
    const byPos: Record<string, number> = {};
    for (const [pos, k] of Object.entries(min)) {
      if (!k) continue;
      const best = t.players
        .filter((p) => p.pos === pos && p.startable)
        .map((p) => p.value)
        .sort((a, b) => b - a)
        .slice(0, k);
      byPos[pos] = best.reduce((s, v) => s + v, 0) / k;
    }
    strength.set(t.rid, byPos);
  }
  const out = new Map<number, TeamNeeds>();
  for (const [rid, mine] of strength) {
    const need: Record<string, number> = {};
    for (const [pos, v] of Object.entries(mine)) {
      const others = [...strength].filter(([r]) => r !== rid).map(([, s]) => s[pos] ?? 0);
      need[pos] = others.length ? others.filter((o) => o > v).length / others.length : 0.5;
    }
    out.set(rid, need);
  }
  return out;
}

/** Buy where you are weak (60%), sell where you are strong (40%). */
function needFit(
  needs: TeamNeeds | undefined,
  get: readonly Player[],
  give: readonly Player[],
  worth: (p: Player) => number,
): { fit: number; pos: string | null } {
  if (!needs) return { fit: 0.5, pos: null };
  const top = (list: readonly Player[]) =>
    list.reduce<Player | null>((b, p) => (!b || worth(p) > worth(b) ? p : b), null);
  const bought = top(get);
  const sold = top(give);
  const buyNeed = bought ? (needs[bought.pos] ?? 0.5) : 0.5;
  const sellNeed = sold ? (needs[sold.pos] ?? 0.5) : 0.5;
  return {
    fit: 0.6 * buyNeed + 0.4 * (1 - sellNeed),
    pos: bought && buyNeed >= NEED_THRESHOLD ? bought.pos : null,
  };
}

/**
 * Suggestions never cost you more than this share of the trade value you
 * send: value comes first, a lineup gain alone does not justify a loss.
 */
export const MAX_VALUE_LOSS = 0.1;

/** With trade values, ideas must be at least this fair, so the partner does not lose either. */
export const MIN_IDEA_FAIRNESS = 0.85;

/** How many players of each position a roster needs (min) and can use (cap). */
export interface PositionNeeds {
  min: Readonly<Record<string, number>>;
  cap: Readonly<Record<string, number>>;
}

/**
 * Starters each position must cover, plus one backup at positions that feed
 * the flex (RB, WR). Superflex counts as a second QB slot. A roster should not
 * carry more than one spare QB, TE, K or DEF.
 */
export function positionNeeds(slots: readonly string[], sport: SportConfig): PositionNeeds {
  const min: Record<string, number> = {};
  const flexFed = new Set<string>();
  for (const slot of slots) {
    const el = sport.slotEligibility[slot] ?? [];
    if (el.length === 1) min[el[0]!] = (min[el[0]!] ?? 0) + 1;
    else if (slot === "SUPER_FLEX") min.QB = (min.QB ?? 0) + 1;
    else for (const pos of el) flexFed.add(pos);
  }
  const cap: Record<string, number> = {};
  for (const pos of sport.positions) {
    const backup = (pos === "RB" || pos === "WR") && flexFed.has(pos) ? 1 : 0;
    min[pos] = (min[pos] ?? 0) + backup;
    cap[pos] = pos === "RB" || pos === "WR" ? Infinity : min[pos]! + 1;
  }
  return { min, cap };
}

const countByPos = (list: readonly Valued[], onlyStartable: boolean) => {
  const out: Record<string, number> = {};
  for (const p of list) if (!onlyStartable || p.startable) out[p.pos] = (out[p.pos] ?? 0) + 1;
  return out;
};

/** Checks one roster before and after a trade against its position needs. */
export function positionCheck(
  before: readonly Valued[],
  after: readonly Valued[],
  give: readonly Valued[],
  get: readonly Valued[],
  needs: PositionNeeds,
): { ok: boolean; fit: number; warnings: string[] } {
  const readyBefore = countByPos(before, true);
  const readyAfter = countByPos(after, true);
  const allBefore = countByPos(before, false);
  const allAfter = countByPos(after, false);
  const warnings: string[] = [];
  for (const [pos, need] of Object.entries(needs.min)) {
    const now = readyAfter[pos] ?? 0;
    if (now < Math.min(need, readyBefore[pos] ?? 0)) {
      warnings.push(`Leaves you ${now} healthy ${pos}${now === 1 ? "" : "s"} (you need ${need})`);
    }
  }
  for (const [pos, cap] of Object.entries(needs.cap)) {
    const now = allAfter[pos] ?? 0;
    if (now > cap && now > (allBefore[pos] ?? 0)) {
      warnings.push(`You would carry ${now} ${pos}s (${cap} is plenty)`);
    }
  }
  // Each player sent should be refilled at his position, unless there is a spare.
  const refilled = give.filter(
    (p) =>
      get.some((g) => g.pos === p.pos) || (readyAfter[p.pos] ?? 0) >= (needs.min[p.pos] ?? 0) + 1,
  ).length;
  return { ok: warnings.length === 0, fit: give.length ? refilled / give.length : 1, warnings };
}

export type FairnessLevel = "green" | "yellow" | "red";

/** Green: fair trade. Yellow: could work but does not look fair. Red: don't do it. */
export function fairnessLevel(fairness: number): FairnessLevel {
  return fairness >= 0.9 ? "green" : fairness >= 0.75 ? "yellow" : "red";
}

/** A true match: fair (green), both lineups gain comparably and both rosters stay balanced. */
export const isTrueMatch = (r: TradeResult) =>
  fairnessLevel(r.fairness) === "green" && r.balance >= 0.5 && r.positionsOk && r.theirPositionsOk;

/** Lineup impact for both teams and value balance of one trade. */
export function evaluateTrade(
  myList: readonly Player[],
  theirList: readonly Player[],
  give: Player[],
  get: Player[],
  myBase: number,
  theirBase: number,
  model: Model,
  sport: SportConfig,
  pool?: FreeAgentPool,
  scores?: ReadonlyMap<string, number>,
  sideNeeds?: { mine?: TeamNeeds; theirs?: TeamNeeds },
): TradeResult {
  const giveIds = new Set(give.map((p) => p.id));
  const getIds = new Set(get.map((p) => p.id));
  let mine: readonly Valued[] = myList.filter((p) => !giveIds.has(p.id)).concat(get);
  let theirs: readonly Valued[] = theirList.filter((p) => !getIds.has(p.id)).concat(give);
  const myOpen = Math.max(0, give.length - get.length);
  const theirOpen = Math.max(0, get.length - give.length);
  const taken = new Set<string>();
  let myPickups: Valued[] = [];
  let theirPickups: Valued[] = [];
  if (myOpen)
    ({ list: mine, added: myPickups } = withFreeAgents(mine, myOpen, model, sport, pool, taken));
  if (theirOpen) {
    ({ list: theirs, added: theirPickups } = withFreeAgents(
      theirs,
      theirOpen,
      model,
      sport,
      pool,
      taken,
    ));
  }
  const meAfter = bestLineup(mine, model.slots, sport).total;
  const themAfter = bestLineup(theirs, model.slots, sport).total;
  const vGive = sumVorp(give);
  const vGet = sumVorp(get);
  // Fairness compares trade values when known, otherwise value above replacement.
  const valueOf = (p: Player) => scores?.get(p.id) ?? 0;
  const sumScore = (list: readonly Player[]) => list.reduce((s, p) => s + valueOf(p), 0);
  const sGive = scores ? sideValue(give.map(valueOf)) : vGive;
  const sGet = scores ? sideValue(get.map(valueOf)) : vGet;
  const hi = Math.max(sGive, sGet);
  const lo = Math.min(sGive, sGet);
  const fairness = hi > 0 ? lo / hi : 1;
  const dMe = meAfter - myBase;
  const dThem = themAfter - theirBase;
  const balance = dMe > 0 && dThem > 0 ? Math.min(dMe, dThem) / Math.max(dMe, dThem) : 0;
  let benchShare = 0;
  const sentTotal = sumScore(give);
  if (scores && sentTotal > 0) {
    const starters = bestLineup(myList, model.slots, sport).used;
    benchShare = sumScore(give.filter((p) => !starters.has(p.id))) / sentTotal;
  }
  const needs = positionNeeds(model.slots, sport);
  const myCheck = positionCheck(myList, mine, give, get, needs);
  const theirCheck = positionCheck(theirList, theirs, get, give, needs);
  const worth = (p: Player) => (scores ? valueOf(p) : p.vorp);
  const mineFit = needFit(sideNeeds?.mine, get, give, worth);
  const theirFit = needFit(sideNeeds?.theirs, give, get, worth);
  const match =
    MATCH.fairness * fairness +
    MATCH.balance * balance +
    MATCH.need * ((mineFit.fit + theirFit.fit) / 2) +
    MATCH.fit * myCheck.fit +
    MATCH.bench * benchShare;
  return {
    give,
    get,
    myOpen,
    theirOpen,
    meBefore: myBase,
    meAfter,
    dMe,
    themBefore: theirBase,
    themAfter,
    dThem,
    vGive,
    vGet,
    fairness,
    sGive,
    sGet,
    positionsOk: myCheck.ok,
    theirPositionsOk: theirCheck.ok,
    positionFit: myCheck.fit,
    warnings: myCheck.warnings,
    myNeedFit: mineFit.fit,
    theirNeedFit: theirFit.fit,
    myNeedPos: mineFit.pos,
    theirNeedPos: theirFit.pos,
    benchShare,
    balance,
    match,
    myPickups,
    theirPickups,
  };
}

/** Every single player and every pair, singles first. */
export function combos<T>(list: readonly T[]): T[][] {
  const out = list.map((p) => [p]);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i]!, list[j]!]);
  }
  return out;
}

/** The players worth offering or asking for: the highest value above replacement. */
export function tradeCandidates(list: readonly Player[], sport: SportConfig): Player[] {
  return list
    .filter((p) => p.vorp > sport.model.minCandidateVorp)
    .sort((a, b) => b.vorp - a.vorp)
    .slice(0, sport.model.candidates);
}

/**
 * Tries every 1-for-1, 2-for-1, 1-for-2 and 2-for-2 deal with every team and
 * keeps the ones that improve both lineups and stay close in value. With trade
 * values, a deal must also not cost you value and must keep both rosters'
 * positions balanced.
 */
export function suggestTrades(
  myRid: number,
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
  pool?: FreeAgentPool,
  scores?: ReadonlyMap<string, number>,
): TradeIdea[] {
  const p = sport.model;
  const mine = rosters.find((t) => t.rid === myRid)?.players ?? [];
  const myBase = bestLineup(mine, model.slots, sport).total;
  const myCombos = combos(tradeCandidates(mine, sport));
  const needs = scores ? teamNeeds(rosters, model, sport) : null;

  const found: TradeIdea[] = [];
  for (const team of rosters) {
    if (team.rid === myRid) continue;
    const theirs = team.players;
    const theirBase = bestLineup(theirs, model.slots, sport).total;
    const theirCombos = combos(tradeCandidates(theirs, sport));
    for (const give of myCombos) {
      for (const get of theirCombos) {
        const r = evaluateTrade(
          mine,
          theirs,
          give,
          get,
          myBase,
          theirBase,
          model,
          sport,
          pool,
          scores,
          needs ? { mine: needs.get(myRid), theirs: needs.get(team.rid) } : undefined,
        );
        if (r.dMe < p.minGainMe || r.dThem < p.minGainThem || r.fairness < p.minFairness) {
          continue;
        }
        // With trade values: fair for both, never lose value, keep both rosters' positions sound,
        // and refill every position you give away.
        if (
          scores &&
          (r.fairness < MIN_IDEA_FAIRNESS ||
            r.sGet < (1 - MAX_VALUE_LOSS) * r.sGive ||
            !r.positionsOk ||
            !r.theirPositionsOk ||
            r.positionFit < 1)
        ) {
          continue;
        }
        // Favor your gain, reward the partner's gain, prefer simpler deals.
        const score =
          r.dMe +
          p.partnerGainWeight * r.dThem -
          p.extraPlayerPenalty * (give.length + get.length - 2);
        found.push({ ...r, partner: team.rid, score });
      }
    }
  }
  if (scores) {
    // With trade values, rank by match quality: green first, then the best match, then your gain.
    const green = (r: TradeIdea) => (fairnessLevel(r.fairness) === "green" ? 1 : 0);
    found.sort((a, b) => green(b) - green(a) || b.match - a.match || b.dMe - a.dMe);
  } else {
    found.sort((a, b) => b.score - a.score);
  }
  return pickDiverse(found, p.maxSuggestions);
}

/** Top ideas with different partners, never offering the same player twice. */
export function pickDiverse(sorted: readonly TradeIdea[], max: number): TradeIdea[] {
  const picked: TradeIdea[] = [];
  const usedMine = new Set<string>();
  const usedPartner = new Set<number>();
  const offersUsed = (r: TradeIdea) => r.give.some((pl) => usedMine.has(pl.id));
  const take = (r: TradeIdea) => {
    picked.push(r);
    usedPartner.add(r.partner);
    for (const pl of r.give) usedMine.add(pl.id);
  };
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!usedPartner.has(r.partner) && !offersUsed(r)) take(r);
  }
  // Fill any remaining spots, still without repeating your players.
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!picked.includes(r) && !offersUsed(r)) take(r);
  }
  return picked;
}
