import type { SportConfig } from "../sports/types";
import type { Valued } from "./types";

export interface Lineup<T extends Valued> {
  /** One entry per slot, in the league's slot order; null when nobody is eligible. */
  slots: (T | null)[];
  total: number;
  used: Set<string>;
}

const eligibleFor = (sport: SportConfig, slot: string) => sport.slotEligibility[slot] ?? [];

/** Slots ordered from most to least restrictive (fixed positions first, then flex). */
export function bySlotRestriction(sport: SportConfig, slots: readonly string[]) {
  return slots
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => eligibleFor(sport, a.slot).length - eligibleFor(sport, b.slot).length);
}

/** Greedy best lineup: the most valuable eligible player for each slot, restrictive slots first. */
export function bestLineup<T extends Valued>(
  players: readonly T[],
  slots: readonly string[],
  sport: SportConfig,
): Lineup<T> {
  const available = players
    .filter((p) => p.startable && p.value > 0)
    .sort((a, b) => b.value - a.value);
  const used = new Set<string>();
  const result: (T | null)[] = new Array<T | null>(slots.length).fill(null);
  let total = 0;
  for (const { slot, index } of bySlotRestriction(sport, slots)) {
    const eligible = eligibleFor(sport, slot);
    const pick = available.find((p) => !used.has(p.id) && p.elig.some((e) => eligible.includes(e)));
    if (pick) {
      used.add(pick.id);
      result[index] = pick;
      total += pick.value;
    }
  }
  return { slots: result, total, used };
}
