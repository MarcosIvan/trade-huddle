import type { Model, Player } from "./types";

/** What position leaders rank by: trade value or fantasy points this season. */
export type LeaderSort = "value" | "points";

export interface Leader {
  player: Player;
  /** The roster that has him, or null for a free agent. */
  rid: number | null;
  /** Trade value. */
  value: number;
  /** Fantasy points this season under the league's scoring. */
  points: number;
  /** Points per game played, or null before his first game. */
  ppg: number | null;
}

/** How many leaders a position shows. */
export const LEADERS_SHOWN = 30;

/** A player's fantasy points this season. */
export const seasonPoints = (p: Player): number => p.weekly.reduce((s, w) => s + (w.pts ?? 0), 0);

/**
 * The league's best players at a position, rostered or free agents, by trade
 * value or by season points (ties go to the other measure).
 */
export function positionLeaders(
  model: Model,
  rosters: readonly { rid: number; playerIds: readonly string[] }[],
  pos: string,
  by: LeaderSort,
  worth: (p: Player) => number,
  limit = LEADERS_SHOWN,
): Leader[] {
  const owner = new Map(rosters.flatMap((t) => t.playerIds.map((id) => [id, t.rid] as const)));
  const key = (l: Leader) => (by === "value" ? [l.value, l.points] : [l.points, l.value]);
  return Object.values(model.players)
    .filter((p) => p.pos === pos)
    .map((p) => {
      const points = seasonPoints(p);
      return {
        player: p,
        rid: owner.get(p.id) ?? null,
        value: worth(p),
        points,
        ppg: p.g > 0 ? points / p.g : null,
      };
    })
    .sort((a, b) => {
      const [a1, a2] = key(a);
      const [b1, b2] = key(b);
      return b1! - a1! || b2! - a2!;
    })
    .slice(0, limit);
}
