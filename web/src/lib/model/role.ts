/**
 * What the box score alone does not say: an injury that ends the season, and
 * the player's role on his team (docs/adr/0023-roles-and-season-ending-injuries.md).
 *
 * - Season over: on IR with an injury that ends seasons (a torn ACL or
 *   Achilles), hurt this season. An old injury he is coming back from (no
 *   games yet, often on PUP) is not.
 * - Lead: first on the depth chart, with a lead player's usage, and recent
 *   form far above what was expected of him before the season: he took the
 *   job during the season, so his preseason prior says little. Or first on
 *   the depth chart and projected the most touches at his position for the
 *   next game, far above his prior, with some usage already (ADR 0028): the
 *   projection shows the new job before two games do.
 * - Backup: behind the starters on the depth chart, with little usage: what
 *   he did before (prior, draft position) is not what he will do now. An
 *   injured player drops down the depth chart while out, so he is left to
 *   his injury status instead.
 */
import type { RoleParams, SeasonEndingParams } from "../sports/types";
import type { Role } from "./types";

export interface SeasonEndingInputs {
  inj: string | null;
  /** Injured body part ("Knee - ACL"). */
  bodyPart: string | undefined;
  /** Games played this season. */
  g: number;
}

/** True when the injury ends his season (and he got it this season). */
export function seasonOver(p: SeasonEndingInputs, params: SeasonEndingParams | null): boolean {
  if (!params || !p.inj || !params.statuses.includes(p.inj) || !p.bodyPart || p.g === 0) {
    return false;
  }
  const words = new Set(p.bodyPart.toLowerCase().split(/[^a-z]+/));
  return params.bodyParts.some((part) => words.has(part.toLowerCase()));
}

export interface RoleInputs {
  pos: string;
  /** Games played this season. */
  g: number;
  /** Points per game over his recent games (real points). */
  lastAvg: number | null;
  /** Prior points per game (projection or last season). */
  prior: number | null;
  /** Depth chart slot and order (1 = starter). */
  depth: readonly [string, number] | undefined;
  /**
   * Usage relative to a lead player at his position (share of team targets +
   * carries / the lead share). Positions without a usage share (QB) pass
   * 1 when he played his team's last game, 0 when he did not.
   */
  usage: number | undefined;
  /** Out for now (any injury status but Questionable): his depth chart spot is a stand-in's. */
  injured: boolean;
  /** Projected the most targets + carries at his position on his team in the next game. */
  projectedTop?: boolean;
  /** Sleeper's projection for his next game (real points). */
  nextGamePpg?: number | null;
}

/** His role, or null when the depth chart and usage say nothing special. */
export function playerRole(p: RoleInputs, params: RoleParams | null): Role | null {
  const starters = params?.starters[p.pos];
  if (!params || starters === undefined || !p.depth || p.usage === undefined) return null;
  const order = p.depth[1];
  if (
    order === 1 &&
    p.g >= params.minGames &&
    p.usage >= params.leadUsage &&
    p.lastAvg !== null &&
    (p.prior ?? 0) <= params.formJump * p.lastAvg
  ) {
    return "lead";
  }
  const byProjection = params.projectedLead;
  if (
    byProjection &&
    order === 1 &&
    p.projectedTop &&
    !p.injured &&
    p.g >= byProjection.minGames &&
    p.usage >= byProjection.minUsage &&
    p.nextGamePpg != null &&
    (p.prior ?? 0) <= params.formJump * p.nextGamePpg
  ) {
    return "lead";
  }
  if (order > starters && p.usage < params.backupUsage && !p.injured) return "backup";
  return null;
}
