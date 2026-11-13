"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { tradeReport, type LeagueTrade, type ReportTrade } from "@/lib/model";
import { fetchTrades } from "@/lib/sleeper/client";
import type { SleeperMatchup, SleeperTrade } from "@/lib/sleeper/validate";

/** A Sleeper trade as the report reads it: what each team received. */
export function leagueTrade(t: SleeperTrade): LeagueTrade {
  return {
    id: t.transaction_id,
    week: t.leg,
    created: t.created,
    sides: t.roster_ids.map((rid) => ({
      rid,
      players: Object.entries(t.adds)
        .filter(([, to]) => to === rid)
        .map(([id]) => id),
      picks: t.draft_picks
        .filter((d) => d.owner_id === rid)
        .map((d) => `${d.season} round ${d.round}`),
      faab: t.waiver_budget.filter((w) => w.receiver === rid).reduce((sum, w) => sum + w.amount, 0),
    })),
  };
}

/**
 * The league's completed trades this season with who is winning each one:
 * value today and points since. Null in the demo, while loading, or when
 * Sleeper fails.
 */
export function useLeagueTrades(
  view: LeagueView,
  matchups: ReadonlyMap<number, SleeperMatchup[]> | null,
  tradeScores: ReadonlyMap<string, number>,
): ReportTrade[] | null {
  const { demo, league } = view;
  const lastScored = league.settings.last_scored_leg ?? 0;
  // Trades go through in the weeks played so far and the week under way.
  const weeks = useMemo(
    () => (demo ? null : Array.from({ length: lastScored + 1 }, (_, i) => i + 1)),
    [demo, lastScored],
  );
  const [state, setState] = useState<{ league: string; trades: SleeperTrade[] } | null>(null);

  useEffect(() => {
    if (!weeks) return;
    const controller = new AbortController();
    fetchTrades(league.league_id, weeks, controller.signal).then(
      (trades) => setState({ league: league.league_id, trades }),
      () => {},
    );
    return () => controller.abort();
  }, [league.league_id, weeks]);

  return useMemo(() => {
    if (!weeks || !matchups || state?.league !== league.league_id) return null;
    const scored = new Map(
      [...matchups]
        .filter(([w]) => w <= lastScored)
        .map(([w, list]) => [
          w,
          list.map((m) => ({
            rid: m.roster_id,
            starters: m.starters,
            playersPoints: m.players_points,
          })),
        ]),
    );
    return tradeReport(state.trades.map(leagueTrade), scored, (id) => tradeScores.get(id) ?? 0);
  }, [weeks, matchups, state, league.league_id, lastScored, tradeScores]);
}
