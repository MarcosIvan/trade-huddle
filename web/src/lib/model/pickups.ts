/**
 * Pick ideas: add a free agent and drop one of your players, one for one,
 * and what such a move does to your roster (ADR 0029). Value first, as in
 * trades: the player you add must be worth more than the one you drop, and
 * your lineup and depth must not get worse.
 */
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import {
  benchDepth,
  inIrSlots,
  positionCheck,
  positionNeeds,
  starterGaps,
  withIdeal,
  type FreeAgentPool,
  idealCounts,
  type IdealRoster,
} from "./trades";
import type { Model, Player } from "./types";

/** Green: a good pickup. Yellow: little to gain or a roster concern. Red: don't do it. */
export type PickLevel = "green" | "yellow" | "red";

export interface PickResult {
  add: Player;
  drop: Player;
  /** Trade value of the player you add and of the one you drop. */
  sAdd: number;
  sDrop: number;
  /** Trade value gained: sAdd − sDrop. */
  valueGain: number;
  /** Change in your starters' expected points per game. */
  dMe: number;
  /** Change in your bench depth (DEPTH_WEIGHT × your best backups, as in trades). */
  depthMe: number;
  /** Starters plus depth: what your team really gains. */
  gain: number;
  /**
   * What the move leaves wrong in your lineup, in words (a position left
   * without enough starters); roster balance is each manager's call.
   */
  lineupWarnings: string[];
  /**
   * The player you add piles up his position: you drop someone at another
   * position and end up with more players at his than a balanced roster
   * carries (a third QB). Pick ideas never suggest it.
   */
  pilesUp: boolean;
  level: PickLevel;
}

/** A pickup must gain at least this much trade value to be a good one. */
export const PICK_MIN_VALUE_GAIN = 1;

/** Free agents per position tried in pick ideas, the most valuable first. */
export const PICK_CANDIDATES = 10;

/** How many pick ideas to show. */
export const PICK_IDEAS = 3;

/**
 * Pick ideas only add players at least this likely to play this week, by
 * injury status (the sport's weekAvailability): no one out, doubtful or on
 * injured reserve, even when his value says he is worth stashing.
 */
export const PICK_MIN_AVAILABILITY = 0.5;

/** Whether a free agent is available to play: not hurt for the season, likely to play this week. */
export function available(p: Player, sport: SportConfig): boolean {
  if (p.seasonOver || !p.startable) return false;
  return (p.inj ? (sport.model.weekAvailability[p.inj] ?? 1) : 1) >= PICK_MIN_AVAILABILITY;
}

/** Small changes in points are rounding, not a loss. */
const EPS = 1e-6;

/**
 * Green when the player you add is worth clearly more (PICK_MIN_VALUE_GAIN)
 * and your team loses nothing, starters and depth together. Red when you
 * lose trade value or your lineup is left short. Yellow in between.
 */
export function pickLevel(r: Pick<PickResult, "valueGain" | "gain" | "lineupWarnings">) {
  if (r.valueGain < 0 || r.lineupWarnings.length > 0) return "red" as const;
  if (r.valueGain >= PICK_MIN_VALUE_GAIN && r.gain >= -EPS) {
    return "green" as const;
  }
  return "yellow" as const;
}

/** What adding one free agent and dropping one of your players does to your roster. */
export function evaluatePick(
  myList: readonly Player[],
  add: Player,
  drop: Player,
  model: Model,
  sport: SportConfig,
  scores: ReadonlyMap<string, number>,
  ideal?: IdealRoster,
): PickResult {
  const after = myList.filter((p) => p.id !== drop.id).concat(add);
  const dMe =
    bestLineup(after, model.slots, sport).total - bestLineup(myList, model.slots, sport).total;
  const depthMe = benchDepth(after, model, sport) - benchDepth(myList, model, sport);
  const needs = withIdeal(positionNeeds(model.slots, sport), ideal);
  const check = positionCheck(myList, after, [drop], [add], needs, "you");
  // Counted as the ideal roster counts them: players in the IR spots left out.
  const pilesUp =
    add.pos !== drop.pos && (idealCounts(after)[add.pos] ?? 0) > (needs.cap[add.pos] ?? Infinity);
  const gaps = starterGaps(myList, after, [drop], [add], model, sport, "you");
  const lineupWarnings = [...check.shortages, ...gaps];
  const sAdd = scores.get(add.id) ?? 0;
  const sDrop = scores.get(drop.id) ?? 0;
  const result = {
    add,
    drop,
    sAdd,
    sDrop,
    valueGain: sAdd - sDrop,
    dMe,
    depthMe,
    gain: dMe + depthMe,
    lineupWarnings,
    pilesUp,
  };
  return { ...result, level: pickLevel(result) };
}

/**
 * Your players you may drop at the given positions, outside the injured
 * reserve spots (dropping one of those frees no roster spot). Pick ideas use
 * the positions a team picks up in trades; the analyzer, every position.
 */
export function dropCandidates(myList: readonly Player[], positions: readonly string[]): Player[] {
  const reserve = inIrSlots(myList);
  return myList.filter((p) => !reserve.has(p) && positions.includes(p.pos));
}

/**
 * The best one-for-one pickups for your roster: the PICK_CANDIDATES most
 * valuable free agents at each position who are `available` against each
 * player you could drop,
 * good ones (green) first, then by trade value gained and team gain. Each
 * idea adds a different free agent and drops a different player, so they can
 * all be made. When fewer than `max` are good, yellow ones fill in; red ones
 * and those that pile up a position (`pilesUp`) never show.
 */
export function suggestPicks(
  myList: readonly Player[],
  pool: FreeAgentPool,
  model: Model,
  sport: SportConfig,
  scores: ReadonlyMap<string, number>,
  ideal?: IdealRoster,
  max = PICK_IDEAS,
): PickResult[] {
  const worth = (p: Player) => scores.get(p.id) ?? 0;
  const drops = dropCandidates(myList, sport.freeAgentPositions);
  const adds = sport.freeAgentPositions.flatMap((pos) =>
    (pool.get(pos) ?? [])
      .filter((p) => available(p, sport))
      .sort((a, b) => worth(b) - worth(a))
      .slice(0, PICK_CANDIDATES),
  );
  const results: PickResult[] = [];
  for (const add of adds) {
    for (const drop of drops) {
      // Value first: only players worth more than the one dropped.
      if (worth(add) <= worth(drop)) continue;
      const r = evaluatePick(myList, add, drop, model, sport, scores, ideal);
      if (r.level !== "red" && !r.pilesUp) results.push(r);
    }
  }
  const rank = { green: 0, yellow: 1, red: 2 } as const;
  results.sort(
    (a, b) =>
      rank[a.level] - rank[b.level] ||
      b.valueGain - a.valueGain ||
      b.gain - a.gain ||
      a.add.name.localeCompare(b.add.name),
  );
  const added = new Set<string>();
  const dropped = new Set<string>();
  const out: PickResult[] = [];
  for (const r of results) {
    if (out.length >= max) break;
    if (added.has(r.add.id) || dropped.has(r.drop.id)) continue;
    added.add(r.add.id);
    dropped.add(r.drop.id);
    out.push(r);
  }
  return out;
}
