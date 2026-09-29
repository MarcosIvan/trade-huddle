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
  /**
   * Change in bench depth: DEPTH_WEIGHT × the best backup at each position.
   * 0 without trade values (the prototype counted starters only).
   */
  depthMe: number;
  depthThem: number;
  /** What each side really gains: starters plus depth. Filters and ranking use these. */
  gainMe: number;
  gainThem: number;
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
  /**
   * How well the positions you send are refilled, 0 to 1, weighted by value: a
   * player back at the same position or a spare counts 1, a free agent less.
   */
  positionFit: number;
  /** Every position you send is refilled somehow (player back, spare or free agent). */
  positionsCovered: boolean;
  /** What the trade leaves wrong on your roster, in words (empty when fine). */
  warnings: string[];
  /** What the trade leaves wrong on the partner's roster, in words. */
  theirWarnings: string[];
  /** Free agents you would add as depth at a position the trade thins out. */
  myBackups: Valued[];
  /** Free agents the partner would add as depth. */
  theirBackups: Valued[];
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
  /** Set when the idea only fills a spot because too few deals pass every rule. */
  problems?: string[];
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
  /** Keep positions balanced (the prototype did not). */
  balanced = false,
): { list: readonly Valued[]; added: Valued[] } {
  let current = list;
  const added: Valued[] = [];
  const { min, cap } = positionNeeds(model.slots, sport);
  const count = (pos: string) => current.filter((p) => p.pos === pos).length;
  for (let n = 1; n <= open; n++) {
    let best: Valued | null = null;
    let bestTotal = -1;
    let bestShort = -Infinity;
    for (const pos of sport.freeAgentPositions) {
      // Never pile up a position (no third QB); on a tie, fill the thinnest position.
      if (balanced && count(pos) >= (cap[pos] ?? Infinity)) continue;
      const real = pool?.get(pos)?.find((p) => !taken.has(p.id));
      const candidate = real ?? freeAgent(model, pos, n);
      const total = bestLineup(current.concat(candidate), model.slots, sport).total;
      const short = balanced ? (min[pos] ?? 0) - count(pos) : 0;
      if (total > bestTotal + 1e-9 || (Math.abs(total - bestTotal) <= 1e-9 && short > bestShort)) {
        bestTotal = total;
        bestShort = short;
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
export const MATCH = { fairness: 0.35, balance: 0.2, need: 0.2, fit: 0.15, bench: 0.1 } as const;

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

/**
 * Weight of a position's best backup in a team's strength: about how often a
 * starter misses a week (byes and injuries).
 */
export const DEPTH_WEIGHT = 0.2;

/** Starters may lose at most this many points per game when bench depth makes up for it. */
export const MAX_STARTER_DIP = 0.5;

/**
 * DEPTH_WEIGHT × what the best healthy backup at each tradable position scores
 * above a free agent there: a deep bench matters where free agents are weak.
 */
export function benchDepth(list: readonly Valued[], model: Model, sport: SportConfig): number {
  const starters = bestLineup(list, model.slots, sport).used;
  let total = 0;
  for (const pos of sport.tradePositions ?? sport.positions) {
    const backup = list
      .filter((p) => p.pos === pos && p.startable && !starters.has(p.id))
      .reduce((best, p) => Math.max(best, p.value), 0);
    total += DEPTH_WEIGHT * Math.max(0, backup - (model.repl[pos] ?? 0));
  }
  return total;
}

/** How well a free agent refills a position you send, next to a player you get back (1). */
export const FREE_AGENT_REFILL = 0.4;

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
  side: "you" | "they" = "you",
  findBackup?: (pos: string) => Valued | null,
  worth: (p: Valued) => number = (p) => p.value,
): { ok: boolean; fit: number; covered: boolean; warnings: string[]; backups: Valued[] } {
  const [subject, object] = side === "you" ? ["You", "you"] : ["They", "them"];
  const readyBefore = countByPos(before, true);
  const readyAfter = countByPos(after, true);
  const allBefore = countByPos(before, false);
  const allAfter = countByPos(after, false);
  const warnings: string[] = [];
  // Spares before any free agent is added: players beyond what the lineup needs.
  const spare = (pos: string) => (readyAfter[pos] ?? 0) >= (needs.min[pos] ?? 0) + 1;
  const spareBefore = new Set(give.map((p) => p.pos).filter(spare));
  // A position left short can be backed up by a free agent worth starting in a pinch.
  const backups: Valued[] = [];
  for (const [pos, need] of Object.entries(needs.min)) {
    const target = Math.min(need, readyBefore[pos] ?? 0);
    while ((readyAfter[pos] ?? 0) < target && findBackup) {
      const fa = findBackup(pos);
      if (!fa) break;
      backups.push(fa);
      readyAfter[pos] = (readyAfter[pos] ?? 0) + 1;
    }
    const now = readyAfter[pos] ?? 0;
    if (now < target) {
      warnings.push(
        `Leaves ${object} ${now} healthy ${pos}${now === 1 ? "" : "s"} (${subject.toLowerCase()} need ${need})`,
      );
    }
  }
  for (const [pos, cap] of Object.entries(needs.cap)) {
    const now = allAfter[pos] ?? 0;
    if (now > cap && now > (allBefore[pos] ?? 0)) {
      warnings.push(`${subject} would carry ${now} ${pos}s (${cap} is plenty)`);
    }
  }
  // How well each player sent is refilled at his position: best by a player coming back
  // in the trade or a spare already on the roster, less well by a free agent. Weighted by
  // value, so the more a player is worth, the more his refill matters.
  const refill = (p: Valued) =>
    get.some((g) => g.pos === p.pos) || spareBefore.has(p.pos)
      ? 1
      : backups.some((b) => b.pos === p.pos)
        ? FREE_AGENT_REFILL
        : 0;
  const total = give.reduce((s, p) => s + Math.max(worth(p), 1e-9), 0);
  const fit = give.length
    ? give.reduce((s, p) => s + Math.max(worth(p), 1e-9) * refill(p), 0) / total
    : 1;
  return {
    ok: warnings.length === 0,
    fit,
    covered: give.every((p) => refill(p) > 0),
    warnings,
    backups,
  };
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
    ({ list: mine, added: myPickups } = withFreeAgents(
      mine,
      myOpen,
      model,
      sport,
      pool,
      taken,
      Boolean(scores),
    ));
  if (theirOpen) {
    ({ list: theirs, added: theirPickups } = withFreeAgents(
      theirs,
      theirOpen,
      model,
      sport,
      pool,
      taken,
      Boolean(scores),
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
  // With trade values, backups count too: a trade that leaves you thin costs something.
  const depth = (before: readonly Valued[], after: readonly Valued[]) =>
    scores ? benchDepth(after, model, sport) - benchDepth(before, model, sport) : 0;
  const depthMe = depth(myList, mine);
  const depthThem = depth(theirList, theirs);
  const gainMe = dMe + depthMe;
  const gainThem = dThem + depthThem;
  const balance =
    gainMe > 0 && gainThem > 0 ? Math.min(gainMe, gainThem) / Math.max(gainMe, gainThem) : 0;
  let benchShare = 0;
  const sentTotal = sumScore(give);
  if (scores && sentTotal > 0) {
    const starters = bestLineup(myList, model.slots, sport).used;
    benchShare = sumScore(give.filter((p) => !starters.has(p.id))) / sentTotal;
  }
  const needs = positionNeeds(model.slots, sport);
  // Real free agents at least at replacement level can back up a position a trade thins out.
  const findBackup = (pos: string) => {
    const fa = pool?.get(pos)?.find((p) => !taken.has(p.id) && p.value >= (model.repl[pos] ?? 0));
    if (fa) taken.add(fa.id);
    return fa ?? null;
  };
  const worth = (p: Valued) => (scores ? (scores.get(p.id) ?? 0) : p.vorp);
  const myCheck = positionCheck(myList, mine, give, get, needs, "you", findBackup, worth);
  const theirCheck = positionCheck(theirList, theirs, get, give, needs, "they", findBackup, worth);
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
    depthMe,
    depthThem,
    gainMe,
    gainThem,
    vGive,
    vGet,
    fairness,
    sGive,
    sGet,
    positionsOk: myCheck.ok,
    theirPositionsOk: theirCheck.ok,
    positionFit: myCheck.fit,
    positionsCovered: myCheck.covered,
    warnings: myCheck.warnings,
    theirWarnings: theirCheck.warnings,
    myBackups: myCheck.backups,
    theirBackups: theirCheck.backups,
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

/** Positions worth trading for (kickers and defenses are streamed, not traded). */
const tradable = (p: Player, sport: SportConfig) =>
  (sport.tradePositions ?? sport.positions).includes(p.pos);

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
  // With trade values, kickers and defenses are left out: they are streamed, not traded.
  const offered = (list: readonly Player[]) =>
    scores ? list.filter((p) => tradable(p, sport)) : list;
  const myCombos = combos(tradeCandidates(offered(mine), sport));
  const needs = scores ? teamNeeds(rosters, model, sport) : null;

  const found: TradeIdea[] = [];
  // With trade values, near misses fill the list when fewer than three deals pass.
  const near: TradeIdea[] = [];
  for (const team of rosters) {
    if (team.rid === myRid) continue;
    const theirs = team.players;
    const theirBase = bestLineup(theirs, model.slots, sport).total;
    const theirCombos = combos(tradeCandidates(offered(theirs), sport));
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
        const problems = ideaProblems(r, sport, Boolean(scores));
        const idea = { ...r, partner: team.rid, score: ideaScore(r, sport) };
        if (!problems.length) found.push(idea);
        else if (scores && r.gainMe > 0) near.push({ ...idea, problems });
      }
    }
  }
  sortIdeas(found, Boolean(scores));
  const picked = pickDiverse(found, p.maxSuggestions);
  if (!scores || picked.length >= p.maxSuggestions) return picked;
  // Fewest problems first, then the same order as real ideas.
  sortIdeas(near, true);
  near.sort((a, b) => a.problems!.length - b.problems!.length);
  return fillDiverse(picked, near, p.maxSuggestions);
}

/** Adds near misses to the picked ideas: new partners first, your players repeated only as a last resort. */
function fillDiverse(picked: TradeIdea[], near: readonly TradeIdea[], max: number): TradeIdea[] {
  const out = [...picked];
  const usedMine = new Set(out.flatMap((r) => r.give.map((p) => p.id)));
  const partners = new Set(out.map((r) => r.partner));
  const fresh = (r: TradeIdea) => !r.give.some((p) => usedMine.has(p.id));
  const take = (r: TradeIdea) => {
    out.push(r);
    partners.add(r.partner);
    for (const p of r.give) usedMine.add(p.id);
  };
  for (const r of near) {
    if (out.length >= max) break;
    if (!partners.has(r.partner) && fresh(r)) take(r);
  }
  for (const r of near) {
    if (out.length >= max) break;
    if (!out.includes(r) && fresh(r)) take(r);
  }
  // Still short: allow a player of yours to appear again, so there are always three.
  for (const r of near) {
    if (out.length >= max) break;
    if (!out.includes(r)) take(r);
  }
  return out;
}

/** Favor your gain, reward the partner's gain, prefer simpler deals (the prototype's ranking). */
function ideaScore(r: TradeResult, sport: SportConfig): number {
  const p = sport.model;
  return (
    r.gainMe +
    p.partnerGainWeight * r.gainThem -
    p.extraPlayerPenalty * (r.give.length + r.get.length - 2)
  );
}

/** With trade values, rank by match quality: green first, then the best match, then your gain. */
/** Your starters gain at least as much as the partner's: the edge you want from a fair deal. */
export const hasEdge = (r: TradeResult) => r.dMe >= r.dThem;

/**
 * With trade values: fair (green) first, then deals where your starters gain
 * more than theirs, then the best match and your gain.
 */
function sortIdeas(found: TradeIdea[], withValues: boolean): void {
  if (withValues) {
    const green = (r: TradeIdea) => (fairnessLevel(r.fairness) === "green" ? 1 : 0);
    const edge = (r: TradeIdea) => (hasEdge(r) ? 1 : 0);
    found.sort(
      (a, b) =>
        green(b) - green(a) || edge(b) - edge(a) || b.match - a.match || b.gainMe - a.gainMe,
    );
  } else {
    found.sort((a, b) => b.score - a.score);
  }
}

/**
 * Why a trade cannot be suggested, in words (empty when it can). Both lineups
 * must gain and the values stay close; with trade values the deal must also be
 * fair for both, not cost you value, keep both rosters' positions sound and
 * refill every position you give away.
 */
export function ideaProblems(r: TradeResult, sport: SportConfig, withValues: boolean): string[] {
  const p = sport.model;
  const out: string[] = [];
  if (r.gainMe < p.minGainMe) out.push("Does not improve your team enough");
  if (r.gainThem < p.minGainThem) out.push("Does not improve their team, so they may say no");
  if (withValues && r.dMe < -MAX_STARTER_DIP) out.push("Weakens your starting lineup");
  if (withValues && r.dThem < -MAX_STARTER_DIP) {
    out.push("Weakens their starting lineup, so they may say no");
  }
  if (!withValues) {
    if (r.fairness < p.minFairness) out.push("The values are too far apart");
    return out;
  }
  const gap = (x: number) => Math.max(0.1, Math.round(x * 10) / 10).toFixed(1);
  if (r.sGet < (1 - MAX_VALUE_LOSS) * r.sGive) {
    out.push(`You would send about ${gap(r.sGive - r.sGet)} more trade value than you get`);
  } else if (r.fairness < MIN_IDEA_FAIRNESS && r.sGet > r.sGive) {
    out.push(
      `About ${gap(MIN_IDEA_FAIRNESS * r.sGet - r.sGive)} more trade value from you would make it fair`,
    );
  } else if (r.fairness < MIN_IDEA_FAIRNESS) {
    out.push("The values are too far apart");
  }
  out.push(...r.warnings, ...r.theirWarnings);
  // A position you send must come back in the trade or stay covered by your own spare:
  // a free agent alone is not enough depth.
  if (r.positionsOk && r.positionFit < 1) {
    out.push("Leaves you without a real backup at a position you send");
  }
  return out;
}

/** Deal shapes the trade finder tries, as [players you send, players you get]. No 3-for-1. */
export const FINDER_SHAPES: readonly (readonly [number, number])[] = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
  [3, 2],
  [2, 3],
];

/** Every group of 1 to `max` players from the list. */
export function groups<T>(list: readonly T[], max: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (current.length) out.push(current);
    if (current.length === max) return;
    for (let i = start; i < list.length; i++) walk(i + 1, [...current, list[i]!]);
  };
  walk(0, []);
  return out;
}

export type FinderMode = "sell" | "get";

export interface FinderIdea extends TradeIdea {
  /** Why it falls short, when no deal passes every rule and this is the closest one. */
  problems: string[];
}

export interface FinderResult {
  /** Up to three deals that pass every rule, best first. */
  ideas: TradeIdea[];
  /** When none passes, the closest deal and what it is missing. */
  closest: FinderIdea | null;
}

/**
 * Deals around one player: "sell" finds what one of your players can bring
 * back from any team; "get" finds packages that bring a player from his team.
 * Same rules and ranking as the trade ideas, in the shapes of FINDER_SHAPES.
 */
export function findTrades(
  mode: FinderMode,
  playerId: string,
  myRid: number,
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
  pool?: FreeAgentPool,
  scores?: ReadonlyMap<string, number>,
): FinderResult {
  const empty: FinderResult = { ideas: [], closest: null };
  const mine = rosters.find((t) => t.rid === myRid)?.players ?? [];
  const owner = rosters.find((t) => t.players.some((p) => p.id === playerId));
  const pinned = owner?.players.find((p) => p.id === playerId);
  if (!owner || !pinned || (mode === "sell") !== (owner.rid === myRid)) return empty;

  const worth = (p: Player) => scores?.get(p.id) ?? p.vorp;
  const top = (list: readonly Player[], n: number) =>
    list
      .filter((p) => p.id !== playerId && tradable(p, sport))
      .sort((a, b) => worth(b) - worth(a))
      .slice(0, n);
  const withPinned = (list: readonly Player[]) => [
    [pinned],
    ...groups(top(list, sport.model.candidates - 1), 2).map((g) => [pinned, ...g]),
  ];
  const allowed = (give: number, get: number) =>
    FINDER_SHAPES.some(([a, b]) => a === give && b === get);

  const withValues = Boolean(scores);
  const needs = scores ? teamNeeds(rosters, model, sport) : null;
  const myBase = bestLineup(mine, model.slots, sport).total;
  const partners = mode === "sell" ? rosters.filter((t) => t.rid !== myRid) : [owner];
  const myGroups =
    mode === "sell" ? withPinned(mine) : groups(top(mine, sport.model.candidates), 3);

  const found: TradeIdea[] = [];
  let closest: FinderIdea | null = null;
  for (const team of partners) {
    const theirs = team.players;
    const theirBase = bestLineup(theirs, model.slots, sport).total;
    const theirGroups =
      mode === "sell" ? groups(top(theirs, sport.model.candidates), 3) : withPinned(theirs);
    for (const give of myGroups) {
      for (const get of theirGroups) {
        if (!allowed(give.length, get.length)) continue;
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
        const idea = { ...r, partner: team.rid, score: ideaScore(r, sport) };
        const problems = ideaProblems(r, sport, withValues);
        if (!problems.length) {
          found.push(idea);
        } else if (
          !closest ||
          problems.length < closest.problems.length ||
          (problems.length === closest.problems.length && r.match > closest.match)
        ) {
          closest = { ...idea, problems };
        }
      }
    }
  }
  sortIdeas(found, withValues);
  const ideas =
    mode === "sell"
      ? pickPartners(found, sport.model.maxSuggestions)
      : found.slice(0, sport.model.maxSuggestions);
  return { ideas, closest: ideas.length ? null : closest };
}

/** Top ideas with different partners when possible (the same player may appear in each). */
function pickPartners(sorted: readonly TradeIdea[], max: number): TradeIdea[] {
  const picked: TradeIdea[] = [];
  const partners = new Set<number>();
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!partners.has(r.partner)) {
      picked.push(r);
      partners.add(r.partner);
    }
  }
  for (const r of sorted) {
    if (picked.length >= max) break;
    if (!picked.includes(r)) picked.push(r);
  }
  return picked;
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
