"use client";

import { useMemo } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { bestLineup, playoffOdds, rosterPlayers, type PlayoffTable } from "@/lib/model";
import type { SleeperMatchup } from "@/lib/sleeper/validate";

/**
 * Playoff odds from the league's matchups: the rest of the regular season
 * simulated. Null without matchups or once the regular season is over.
 */
export function usePlayoffOdds(
  view: LeagueView,
  matchups: ReadonlyMap<number, SleeperMatchup[]> | null,
): PlayoffTable | null {
  const { league, teams, model, sport } = view;
  return useMemo(() => {
    const start = league.settings.playoff_week_start;
    const lastScored = league.settings.last_scored_leg ?? 0;
    if (!matchups || !start || lastScored >= start - 1) return null;
    return playoffOdds({
      teams: teams.map((t) => ({
        rid: t.rid,
        wins: t.wins,
        losses: t.losses,
        ties: t.ties,
        fpts: t.fpts,
        strength: bestLineup(rosterPlayers(model, t.playerIds, t.reserveIds), model.slots, sport)
          .total,
      })),
      weeks: new Map(
        [...matchups].map(([w, list]) => [
          w,
          list.map((m) => ({ rid: m.roster_id, matchupId: m.matchup_id, points: m.points })),
        ]),
      ),
      lastScored,
      playoffStart: start,
      playoffTeams: league.settings.playoff_teams ?? 0,
      medianGame: league.settings.league_average_match === 1,
    });
  }, [matchups, league, teams, model, sport]);
}
