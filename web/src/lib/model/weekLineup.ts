/**
 * A team's lineup for this week's games: every player rated by his weekly
 * outlook (weekly.ts), the best lineup of the healthy ones, then the bench
 * and the injured reserve, as on Sleeper.
 */
import type { SportConfig } from "../sports/types";
import { rosterPlayers } from "./build";
import { bestLineup, type Lineup } from "./lineup";
import { onIr } from "./trades";
import type { Model, Player, Valued } from "./types";
import type { WeeklyOutlook } from "./weekly";

/** A player valued by this week's projection, with his outlook. */
export type WeekRated = Valued & { player: Player; outlook: WeeklyOutlook };

export interface WeekLineup {
  lineup: Lineup<WeekRated>;
  bench: WeekRated[];
  ir: WeekRated[];
}

/** A player with no outlook (no game found for him) sits out like on a bye. */
const NO_GAME: WeeklyOutlook = {
  pts: 0,
  opponent: null,
  home: false,
  matchup: 1,
  bye: true,
  availability: 1,
};

/** Rates every player on the team by this week's projection and picks the best lineup. */
export function weekLineup(
  model: Model,
  team: { playerIds: readonly string[]; reserveIds?: readonly string[] | null } | undefined,
  outlook: ReadonlyMap<string, WeeklyOutlook>,
  sport: SportConfig,
): WeekLineup {
  const rated: WeekRated[] = rosterPlayers(model, team?.playerIds ?? [], team?.reserveIds).map(
    (p) => {
      const o = outlook.get(p.id) ?? NO_GAME;
      return { ...p, player: p, outlook: o, value: o.pts, startable: !o.bye && o.availability > 0 };
    },
  );
  // Players in the team's IR slots never start; everyone else not starting sits on the bench,
  // bye weeks and injuries included.
  const ir = rated.filter((r) => onIr(r));
  const active = rated.filter((r) => !onIr(r));
  const lineup = bestLineup(active, model.slots, sport);
  const bench = active.filter((r) => !lineup.used.has(r.id)).sort((a, b) => b.value - a.value);
  return { lineup, bench, ir };
}
