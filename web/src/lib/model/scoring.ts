import type { PackedStats } from "./types";

export type Scorer = (packed: PackedStats | undefined) => number;

/**
 * Fantasy points are linear: sum of stat × league weight. This holds for
 * bonuses (bonus_rec_te) and defense brackets (pts_allow_14_20) too.
 */
export function makeScorer(
  keys: readonly string[],
  scoring: Readonly<Record<string, number>> | undefined,
): Scorer {
  const weights = keys.map((k) => {
    const w = scoring?.[k];
    return typeof w === "number" ? w : 0;
  });
  return (packed) => {
    let total = 0;
    if (!packed) return 0;
    for (let i = 0; i + 1 < packed.length; i += 2) {
      total += (weights[packed[i]!] ?? 0) * packed[i + 1]!;
    }
    return total;
  };
}

export function average(values: readonly number[]): number | null {
  return values.length ? values.reduce((s, x) => s + x, 0) / values.length : null;
}
