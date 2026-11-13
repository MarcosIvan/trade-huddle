/**
 * The league's position needs map: every team's rank with its whole roster,
 * its starting lineup, and at each position its starters and its bench, from
 * the strongest (1) to the weakest, in the matchup labels' five levels
 * (great: among the strongest fifth; brutal: among the weakest, where the
 * team needs help). Teams are listed from the strongest roster (its best
 * lineup plus bench depth, as trades weigh a team) to the weakest, so the
 * map also reads as power rankings.
 */
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { rankLevel, type MatchupLevel } from "./matchup";
import { positionRank } from "./positionStrength";
import { benchDepth, type TeamRoster } from "./trades";
import type { Model, Valued } from "./types";

export interface NeedsCell {
  /** 1 is the league's strongest. */
  rank: number;
  level: MatchupLevel;
  /**
   * Points per game: the average of the starters (or of the bench) at the
   * position, or the whole lineup's or roster's total.
   */
  ppg: number;
}

/** A position's starters and bench; `bench` is null when the team has no backup there. */
export interface PositionCells {
  starters: NeedsCell;
  bench: NeedsCell | null;
}

export interface NeedsRow {
  rid: number;
  /** By position. */
  cells: Readonly<Record<string, PositionCells>>;
  /** The whole roster: the best lineup plus bench depth (benchDepth). */
  roster: NeedsCell;
  /** The whole starting lineup. */
  lineup: NeedsCell;
}

export interface NeedsMap {
  /** Positions shown, in the sport's order: the tradable ones with a slot of their own. */
  positions: string[];
  teams: number;
  /** Strongest roster first. */
  rows: NeedsRow[];
}

/**
 * Slots of a position's own in the lineup (flex slots left out), so every
 * team is measured on the same number of starters: QB 1 (2 in superflex),
 * RB 2, WR 2, TE 1; one at each NBA position.
 */
export function ownSlots(slots: readonly string[], sport: SportConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const slot of slots) {
    const el = sport.slotEligibility[slot] ?? [];
    const pos = el.length === 1 ? el[0]! : slot === "SUPER_FLEX" ? "QB" : null;
    if (pos) out[pos] = (out[pos] ?? 0) + 1;
  }
  return out;
}

/**
 * A team's starters and bench at a position: the average value of its best
 * `k` healthy players there, and of the next `k` (a missing backup counts as
 * zero, so a thin bench ranks low); no bench at all is null.
 */
export function startersAndBench(
  players: readonly Valued[],
  pos: string,
  k: number,
): { starters: number; bench: number | null } {
  const values = players
    .filter((p) => p.pos === pos && p.startable)
    .map((p) => p.value)
    .sort((a, b) => b - a);
  const avg = (list: number[]) => list.reduce((s, v) => s + v, 0) / k;
  const backups = values.slice(k, 2 * k);
  return { starters: avg(values.slice(0, k)), bench: backups.length ? avg(backups) : null };
}

/**
 * Ranks every team's value at one key among the league's. Teams without a
 * value there (no bench) get no cell and rank below every team with one.
 */
function cells(
  strengths: ReadonlyMap<number, Readonly<Record<string, number | null>>>,
  key: string,
): Map<number, NeedsCell | null> {
  const values = [...strengths.values()].map((s) => s[key] ?? 0);
  const of = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / (of || 1);
  const flat = new Map([...strengths].map(([rid, s]) => [rid, { [key]: s[key] ?? 0 }]));
  const out = new Map<number, NeedsCell | null>();
  for (const [rid, s] of strengths) {
    const value = s[key];
    if (value === null || value === undefined) {
      out.set(rid, null);
      continue;
    }
    const above = values.filter((v) => v > value).length;
    const below = values.filter((v) => v < value).length;
    out.set(rid, {
      rank: positionRank(flat, rid, key),
      level: rankLevel(above, below, of, mean > 0 ? value / mean : 1),
      ppg: value,
    });
  }
  return out;
}

const LINEUP = "*";
const ROSTER = "**";
const BENCH = ":bench";

export function needsMap(
  rosters: readonly TeamRoster[],
  model: Model,
  sport: SportConfig,
): NeedsMap {
  const own = ownSlots(model.slots, sport);
  const positions = (sport.tradePositions ?? sport.positions).filter((p) => (own[p] ?? 0) > 0);
  const strengths = new Map(
    rosters.map((t) => {
      const lineup = bestLineup(t.players, model.slots, sport).total;
      const s: Record<string, number | null> = {
        [LINEUP]: lineup,
        [ROSTER]: lineup + benchDepth(t.players, model, sport),
      };
      for (const pos of positions) {
        const { starters, bench } = startersAndBench(t.players, pos, own[pos]!);
        s[pos] = starters;
        s[pos + BENCH] = bench;
      }
      return [t.rid, s] as const;
    }),
  );
  const keys = [LINEUP, ROSTER, ...positions.flatMap((p) => [p, p + BENCH])];
  const byKey = new Map(keys.map((k) => [k, cells(strengths, k)]));
  const at = (key: string, rid: number) => byKey.get(key)!.get(rid) ?? null;
  const rows = rosters.map((t) => ({
    rid: t.rid,
    cells: Object.fromEntries(
      positions.map((p) => [p, { starters: at(p, t.rid)!, bench: at(p + BENCH, t.rid) }]),
    ),
    roster: at(ROSTER, t.rid)!,
    lineup: at(LINEUP, t.rid)!,
  }));
  rows.sort((a, b) => b.roster.ppg - a.roster.ppg || a.rid - b.rid);
  return { positions, teams: rosters.length, rows };
}
