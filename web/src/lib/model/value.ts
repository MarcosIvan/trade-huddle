import type { ModelParams } from "../sports/types";
import type { ReplacementLevels, ValueWeights } from "./types";

/** The inputs of a player's value: production so far and availability. */
export interface ValueInputs {
  pos: string;
  /** Games played this season. */
  g: number;
  seasonAvg: number | null;
  lastAvg: number | null;
  /** Games played last season. */
  prevG: number;
  prevPpg: number | null;
  inj: string | null;
}

export interface Estimate {
  value: number;
  startable: boolean;
  injMult: number;
  weights: ValueWeights;
}

/**
 * Expected points per game from here on: a blend of last season, this season
 * and recent form. Players with little history are pulled toward replacement
 * level. Pass `repl = null` on the first pass, before replacement is known.
 */
export function estimate(
  pl: ValueInputs,
  repl: ReplacementLevels | null,
  params: ModelParams,
): Estimate {
  let wPrev = 0;
  let wSeason = 0;
  let wRecent = 0;
  let base = 0;
  const hasPrev = pl.prevG > 0;
  const prevPpg = pl.prevPpg ?? 0;

  if (pl.g === 0) {
    if (hasPrev) {
      base = prevPpg;
      wPrev = 1;
    }
  } else {
    if (hasPrev) {
      wPrev =
        Math.max(params.wPrevMin, params.wPrevStart - params.wPrevDecay * pl.g) *
        Math.min(1, pl.prevG / params.prevFullGames);
    }
    const rest = 1 - wPrev;
    wRecent = rest * params.recentShare;
    wSeason = rest - wRecent;
    base =
      wPrev * (hasPrev ? prevPpg : 0) + wSeason * (pl.seasonAvg ?? 0) + wRecent * (pl.lastAvg ?? 0);
  }

  // Small sample and no track record: pull toward replacement level.
  let wRepl = 0;
  if (repl && pl.prevG < params.prevFullGames) {
    const missing = 1 - pl.prevG / params.prevFullGames;
    wRepl = (params.shrinkGames * missing) / (params.shrinkGames * missing + pl.g + pl.prevG) || 0;
    if (pl.g === 0 && !hasPrev) wRepl = 1;
  }
  const replVal = repl ? (repl[pl.pos] ?? 0) : 0;
  const raw = (1 - wRepl) * base + wRepl * replVal;

  const rule = pl.inj ? params.injury[pl.inj] : undefined;
  const mult = rule?.mult ?? 1;
  const k = 1 - wRepl;
  return {
    value: Math.max(0, raw * mult),
    startable: rule?.startable ?? true,
    injMult: mult,
    weights: { prev: wPrev * k, season: wSeason * k, recent: wRecent * k, repl: wRepl },
  };
}
