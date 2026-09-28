/**
 * Expected points from opportunity. Targets and carries are steadier than
 * touchdowns, so a game's points can be blended with what its targets and
 * carries usually produce. What an opportunity is worth depends on the
 * league's scoring, so it is learned from this season's games at each
 * position with a small least-squares fit.
 */

/** Stats that describe opportunity, in the order used by the fit. */
export const USAGE_KEYS = ["rec_tgt", "rush_att", "rec_rz_tgt"] as const;

export interface UsageSample {
  x: readonly number[];
  y: number;
}

/** Fewer games than this at a position and the fit is not trusted. */
const MIN_SAMPLES = 40;
/** Small ridge term: keeps the fit stable when a feature is rare (e.g. red-zone targets). */
const RIDGE = 1;

/** Points per opportunity (no intercept), or null when there is too little data. */
export function fitPointsPerOpportunity(samples: readonly UsageSample[]): number[] | null {
  if (samples.length < MIN_SAMPLES) return null;
  const n = samples[0]?.x.length ?? 0;
  const a: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === j ? RIDGE : 0)),
  );
  for (const { x, y } of samples) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) a[i]![j]! += x[i]! * x[j]!;
      a[i]![n]! += x[i]! * y;
    }
  }
  return solve(a);
}

/** Gaussian elimination with partial pivoting on an n × (n + 1) augmented matrix. */
function solve(a: number[][]): number[] | null {
  const n = a.length;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r]![col]!) > Math.abs(a[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(a[pivot]![col]!) < 1e-9) return null;
    [a[col], a[pivot]] = [a[pivot]!, a[col]!];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]! / a[col]![col]!;
      for (let c = col; c <= n; c++) a[r]![c]! -= f * a[col]![c]!;
    }
  }
  return a.map((row, i) => row[n]! / row[i]!);
}

export function expectedPoints(coef: readonly number[], x: readonly number[]): number {
  return coef.reduce((s, c, i) => s + c * (x[i] ?? 0), 0);
}
