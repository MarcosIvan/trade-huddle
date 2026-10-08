"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { buildTeams, leagueNotices, pickMyTeam, type NoticeKind, type Team } from "@/lib/league";
import { buildModel, type Model, type StatsFile } from "@/lib/model";
import {
  allUserLeagues,
  fetchLeague,
  UserError,
  type LeagueData,
  type UserLeague,
} from "@/lib/sleeper/client";
import {
  isLeagueId,
  parseLeague,
  parseLeagueUsers,
  parseRosters,
  type SleeperLeague,
} from "@/lib/sleeper/validate";
import { sportOf } from "@/lib/sports";
import { NFL } from "@/lib/sports/nfl";
import type { SportConfig } from "@/lib/sports/types";
import { BASE_PATH, loadStats } from "@/lib/stats";
import { storage } from "@/lib/storage";

export interface LeagueView {
  demo: boolean;
  /** The league's sport: its positions, slots and model. */
  sport: SportConfig;
  stats: StatsFile;
  league: SleeperLeague;
  teams: Team[];
  model: Model;
  notices: NoticeKind[];
}

export type LeagueStatus =
  | { kind: "starting" }
  | { kind: "entry"; error: string | null }
  | { kind: "loading" }
  | { kind: "ready"; view: LeagueView };

/** The demo league has no real Sleeper ID; it gets a placeholder that passes validation. */
const DEMO_LEAGUE_ID = "00000";

async function loadDemo(): Promise<LeagueData & { myRid: number }> {
  const response = await fetch(`${BASE_PATH}/data/${NFL.id}/demo_league.json`);
  if (!response.ok) throw new UserError("Could not open the demo league.");
  const raw = (await response.json()) as Record<string, unknown>;
  const league = parseLeague({ ...(raw.league as object), league_id: DEMO_LEAGUE_ID });
  if (!league) throw new UserError("Could not open the demo league.");
  return {
    league,
    rosters: parseRosters(raw.rosters),
    users: parseLeagueUsers(raw.users),
    myRid: Number(raw.my_roster_id),
  };
}

export function friendlyError(error: unknown): string {
  if (error instanceof UserError) return error.message;
  console.error(error);
  return "Something went wrong while loading the data. Try again in a minute.";
}

function setUrl(search: string) {
  window.history.replaceState(null, "", window.location.pathname + search);
}

export function useLeague() {
  const [status, setStatus] = useState<LeagueStatus>({ kind: "starting" });
  const [myRid, setMyRid] = useState<number | null>(null);
  /** The visitor's leagues in every sport, for the league picker; null until known. */
  const [leagues, setLeagues] = useState<UserLeague[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(0);

  const show = useCallback(
    (data: LeagueData, stats: StatsFile, demo: boolean, preferred: number | null) => {
      const teams = buildTeams(data.rosters, data.users);
      const sport = sportOf(data.league.sport);
      const view: LeagueView = {
        demo,
        sport,
        stats,
        league: data.league,
        teams,
        model: buildModel(stats, data.league, sport),
        notices: leagueNotices(data.league, sport, demo),
      };
      setMyRid((current) =>
        pickMyTeam(teams, preferred ?? current, demo ? null : storage.get("uid")),
      );
      setStatus({ kind: "ready", view });
    },
    [],
  );

  const openLeague = useCallback(
    async (leagueId: string) => {
      if (!isLeagueId(leagueId)) {
        setStatus({ kind: "entry", error: "That league ID or link is not valid." });
        return;
      }
      const load = ++loadRef.current;
      setStatus({ kind: "loading" });
      try {
        // The league says its sport, and the sport says which stats file to load.
        const data = await fetchLeague(leagueId);
        const stats = await loadStats(sportOf(data.league.sport).id, false);
        if (load !== loadRef.current) return;
        storage.set("league", leagueId);
        setUrl(`?league=${encodeURIComponent(leagueId)}`);
        setMyRid(null);
        show(data, stats, false, null);
      } catch (error) {
        if (load === loadRef.current) setStatus({ kind: "entry", error: friendlyError(error) });
      }
    },
    [show],
  );

  const openDemo = useCallback(async () => {
    const load = ++loadRef.current;
    setStatus({ kind: "loading" });
    try {
      const [stats, demo] = await Promise.all([loadStats(NFL.id, true), loadDemo()]);
      if (load !== loadRef.current) return;
      setUrl("?demo");
      setMyRid(null);
      show(demo, stats, true, demo.myRid);
    } catch (error) {
      if (load === loadRef.current) {
        setStatus({ kind: "entry", error: `Could not open the demo. ${friendlyError(error)}` });
      }
    }
  }, [show]);

  /** Fetches rosters again (trades and signings made since the page opened). */
  const refresh = useCallback(async () => {
    if (status.kind !== "ready" || status.view.demo) return;
    const { league, stats } = status.view;
    setRefreshing(true);
    try {
      show(await fetchLeague(league.league_id), stats, false, null);
    } catch (error) {
      setStatus({ kind: "entry", error: friendlyError(error) });
    } finally {
      setRefreshing(false);
    }
  }, [status, show]);

  const leave = useCallback(() => {
    loadRef.current++;
    storage.remove("league");
    setUrl("");
    setStatus({ kind: "entry", error: null });
  }, []);

  // A league opened straight from the URL or storage: fetch the visitor's
  // leagues for the picker. Without them the picker just stays hidden.
  const needLeagues = status.kind === "ready" && !status.view.demo && leagues === null;
  useEffect(() => {
    const uid = storage.get("uid");
    if (!needLeagues || !uid) return;
    const controller = new AbortController();
    allUserLeagues(uid, controller.signal).then(setLeagues, () => {});
    return () => controller.abort();
  }, [needLeagues]);

  // First visit: ?demo, ?league=<id>, the last league, or the entry screen.
  // The URL and storage only exist in the browser (the page is prerendered as
  // static HTML), so they are read once after mounting.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const fromUrl = query.get("league");
    const leagueId = fromUrl ?? storage.get("league");
    if (query.has("demo")) void openDemo();
    else if (leagueId && isLeagueId(leagueId)) void openLeague(leagueId);
    else setStatus({ kind: "entry", error: fromUrl ? "That league link is not valid." : null });
  }, [openDemo, openLeague]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    status,
    myRid,
    leagues,
    setLeagues,
    refreshing,
    openLeague,
    openDemo,
    refresh,
    leave,
  };
}
