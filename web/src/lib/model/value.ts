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
  /** No team right now: the player cannot score until someone signs him. */
  noTeam?: boolean;
  /** Preseason projection, points per game under the league's scoring. */
  projPpg?: number | null;
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
  // The prior: last season, blended with the preseason projection when there is one.
  // A projection counts as a full track record, so rookies are not pulled to replacement.
  const proj =
    params.projWeight > 0 && pl.projPpg != null && pl.projPpg > 0
      ? pl.projPpg * params.projScale
      : null;
  const lastSeason = pl.prevG > 0 ? (pl.prevPpg ?? 0) : null;
  const prevPpg =
    proj === null
      ? (lastSeason ?? 0)
      : lastSeason === null
        ? proj
        : (1 - params.projWeight) * lastSeason + params.projWeight * proj;
  const prevG = proj === null ? pl.prevG : Math.max(pl.prevG, params.prevFullGames);
  const hasPrev = prevG > 0;

  if (pl.g === 0) {
    if (hasPrev) {
      base = prevPpg;
      wPrev = 1;
    }
  } else {
    if (hasPrev) {
      const fade =
        params.prevReliabilityGames > 0
          ? (params.wPrevStart * params.prevReliabilityGames) / (params.prevReliabilityGames + pl.g)
          : params.wPrevStart - params.wPrevDecay * pl.g;
      wPrev = Math.max(params.wPrevMin, fade) * Math.min(1, prevG / params.prevFullGames);
    }
    const rest = 1 - wPrev;
    // Early on, "this season" and "the last games" are the same games: count them once.
    const recentCounts = !params.recentAfterWindow || pl.g > params.recentGames;
    wRecent = recentCounts ? rest * params.recentShare : 0;
    wSeason = rest - wRecent;
    base =
      wPrev * (hasPrev ? prevPpg : 0) + wSeason * (pl.seasonAvg ?? 0) + wRecent * (pl.lastAvg ?? 0);
  }

  // Small sample and no track record: pull toward replacement level.
  let wRepl = 0;
  if (repl && prevG < params.prevFullGames) {
    const missing = 1 - prevG / params.prevFullGames;
    wRepl = (params.shrinkGames * missing) / (params.shrinkGames * missing + pl.g + prevG) || 0;
    if (pl.g === 0 && !hasPrev) wRepl = 1;
  }
  const replVal = repl ? (repl[pl.pos] ?? 0) : 0;
  const raw = (1 - wRepl) * base + wRepl * replVal;

  const rule = pl.inj ? params.injury[pl.inj] : undefined;
  const noTeam = Boolean(pl.noTeam) && params.noTeamMult !== null;
  const mult = (rule?.mult ?? 1) * (noTeam ? (params.noTeamMult ?? 1) : 1);
  const k = 1 - wRepl;
  return {
    value: Math.max(0, raw * mult),
    startable: (rule?.startable ?? true) && !noTeam,
    injMult: mult,
    weights: { prev: wPrev * k, season: wSeason * k, recent: wRecent * k, repl: wRepl },
  };
}
