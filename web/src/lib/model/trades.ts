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
  const hi = Math.max(vGive, vGet);
  const lo = Math.min(vGive, vGet);
  return {
    give,
    get,
    myOpen,
    theirOpen,
    meBefore: myBase,
    meAfter,
    dMe: meAfter - myBase,
    themBefore: theirBase,
    themAfter,
    dThem: themAfter - theirBase,
    vGive,
    vGet,
    fairness: hi > 0 ? lo / hi : 1,
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
 * keeps the ones that improve both lineups and stay close in value.
 */
export function suggestTrades(
  myRid: number,
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
  pool?: FreeAgentPool,
): TradeIdea[] {
  const p = sport.model;
  const mine = rosters.find((t) => t.rid === myRid)?.players ?? [];
  const myBase = bestLineup(mine, model.slots, sport).total;
  const myCombos = combos(tradeCandidates(mine, sport));

  const found: TradeIdea[] = [];
  for (const team of rosters) {
    if (team.rid === myRid) continue;
    const theirs = team.players;
    const theirBase = bestLineup(theirs, model.slots, sport).total;
    const theirCombos = combos(tradeCandidates(theirs, sport));
    for (const give of myCombos) {
      for (const get of theirCombos) {
        const r = evaluateTrade(mine, theirs, give, get, myBase, theirBase, model, sport, pool);
        if (r.dMe < p.minGainMe || r.dThem < p.minGainThem || r.fairness < p.minFairness) {
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
  found.sort((a, b) => b.score - a.score);
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
