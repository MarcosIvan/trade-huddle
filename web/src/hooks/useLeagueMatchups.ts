"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { fetchMatchups } from "@/lib/sleeper/client";
import type { SleeperLeague, SleeperMatchup } from "@/lib/sleeper/validate";

/** Every week of the regular season, or null when the league does not say when it ends. */
export function regularSeasonWeeks(league: SleeperLeague): number[] | null {
  const start = league.settings.playoff_week_start;
  if (!start || start < 2) return null;
  return Array.from({ length: start - 1 }, (_, i) => i + 1);
}

/**
 * The league's matchups for every regular season week (scores so far, the
 * pairings ahead), fetched once per league and shared by the playoff odds
 * and the trade report. Null in the demo, while loading, or when Sleeper
 * fails: both are extras, so their sections just stay hidden.
 */
export function useLeagueMatchups(view: LeagueView): Map<number, SleeperMatchup[]> | null {
  const { demo, league } = view;
  const weeks = useMemo(() => (demo ? null : regularSeasonWeeks(league)), [demo, league]);
  const [state, setState] = useState<{
    league: string;
    data: Map<number, SleeperMatchup[]>;
  } | null>(null);

  useEffect(() => {
    if (!weeks) return;
    const controller = new AbortController();
    fetchMatchups(league.league_id, weeks, controller.signal).then(
      (data) => setState({ league: league.league_id, data }),
      () => {},
    );
    return () => controller.abort();
  }, [league.league_id, weeks]);

  return weeks && state?.league === league.league_id ? state.data : null;
}
