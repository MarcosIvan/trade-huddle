"use client";

import { useId, useMemo, useState } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { useTradeIdeas } from "@/hooks/useTradeIdeas";
import { fmt } from "@/lib/format";
import { SUPPORTED_SPORTS, type UserLeague } from "@/lib/sleeper/client";
import {
  defaultIdealRoster,
  idealPlayers,
  freeAgentPool,
  playerScores,
  rosterPlayers,
  weeklyOutlook,
  type FinderMode,
  type TradeIdea,
} from "@/lib/model";
import { ScoreContext } from "./ScoreContext";
import { NFL } from "@/lib/sports/nfl";
import { WeeklyLineup, weekLineup } from "./WeeklyLineup";
import { NewsProvider } from "./News";
import { PlayerCardProvider } from "./PlayerCard";
import { Notices } from "./Notices";
import { Section } from "./Section";
import { TeamLineup } from "./TeamLineup";
import { TradeAnalyzer } from "./TradeAnalyzer";
import { TradeFinder } from "./TradeFinder";
import { TradeIdeas } from "./TradeIdeas";
import styles from "./LeagueScreen.module.css";

interface AnalyzerState {
  partnerRid: number | null;
  give: ReadonlySet<string>;
  get: ReadonlySet<string>;
}

const EMPTY: AnalyzerState = { partnerRid: null, give: new Set(), get: new Set() };

function toggle(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function LeagueScreen({
  view,
  myRid,
  leagues,
  refreshing,
  onLeague,
  onRefresh,
}: {
  view: LeagueView;
  myRid: number;
  /** The visitor's leagues in every sport; null while unknown (and in the demo). */
  leagues: UserLeague[] | null;
  refreshing: boolean;
  onLeague: (leagueId: string) => void;
  onRefresh: () => void;
}) {
  const { stats, league, teams, model, demo, notices } = view;
  // Player Scores (0-100); the owner-independent trade value (1-40) drives fairness.
  const scores = useMemo(() => playerScores(model, stats, teams, NFL), [model, stats, teams]);
  const tradeScores = useMemo(
    () => new Map([...scores].map(([id, s]) => [id, s.trade] as const)),
    [scores],
  );

  // The roster shape trades keep you close to: the league's roster size spread over the
  // positions (starters plus backups). Not shown; it keeps positions balanced.
  const ideal = useMemo(
    () => defaultIdealRoster(model.slots, NFL, idealPlayers(league.roster_positions ?? [], NFL)),
    [model, league],
  );

  const { ideas, searching } = useTradeIdeas(model, teams, myRid, tradeScores, ideal);

  // Trade finder: sell one of your players or get one from another team.
  const [finder, setFinder] = useState<{
    forRid: number;
    mode: FinderMode;
    playerId: string | null;
  }>({ forRid: myRid, mode: "sell", playerId: null });

  // The analyzer starts on the first idea's partner; the user can change it.
  const [analyzer, setAnalyzer] = useState<AnalyzerState & { forRid: number }>({
    ...EMPTY,
    forRid: myRid,
  });
  const current = analyzer.forRid === myRid ? analyzer : { ...EMPTY, forRid: myRid };
  const partnerRid =
    current.partnerRid ?? ideas[0]?.partner ?? teams.find((t) => t.rid !== myRid)?.rid ?? null;

  // Shared scale for the weekly bars: the best week by any rostered player.
  const sparkMax = useMemo(() => {
    let max = 10;
    for (const t of teams) {
      for (const p of rosterPlayers(model, t.playerIds)) {
        for (const w of p.weekly) if (w.pts !== null && w.pts > max) max = w.pts;
      }
    }
    return max;
  }, [model, teams]);

  // This week's projections, when the season has a week left to play.
  const week = stats.lineup_week ?? null;
  const outlook = useMemo(
    () => (week ? weeklyOutlook(model, stats, league, week, NFL.model) : null),
    [model, stats, league, week],
  );
  const thisWeek = useMemo(
    () =>
      outlook
        ? weekLineup(
            model,
            teams.find((t) => t.rid === myRid),
            outlook,
          )
        : null,
    [model, teams, myRid, outlook],
  );

  // Players on no roster in this league: who you could pick up after an uneven trade.
  const pool = useMemo(
    () => freeAgentPool(model, new Set(teams.flatMap((t) => t.playerIds))),
    [model, teams],
  );

  function openIdea(idea: TradeIdea) {
    setAnalyzer({
      forRid: myRid,
      partnerRid: idea.partner,
      give: new Set(idea.give.map((p) => p.id)),
      get: new Set(idea.get.map((p) => p.id)),
    });
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("analyzer")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  return (
    <ScoreContext.Provider value={scores}>
      {/* News is for real players: the demo league is fictional. */}
      <NewsProvider sport={NFL.id} enabled={!demo}>
        <PlayerCardProvider model={model} stats={stats} sport={NFL}>
          <div className="container">
            <header className={styles.header}>
              <div className={styles.titleBlock}>
                <h1 className={styles.title}>
                  {league.name}
                  {demo && <span className={styles.demoTag}>Fictional data</span>}
                </h1>
              </div>
              <div className={styles.controls}>
                {!demo && leagues && leagues.length > 0 && (
                  <LeaguePicker current={league} leagues={leagues} onLeague={onLeague} />
                )}
                {!demo && (
                  <div className={styles.buttons}>
                    <button className="btn" type="button" onClick={onRefresh} disabled={refreshing}>
                      {refreshing ? "Refreshing…" : "Refresh rosters"}
                    </button>
                  </div>
                )}
              </div>
            </header>

            <Notices kinds={notices} />

            <div className={styles.grid}>
              {week && thisWeek ? (
                <Section
                  id="team"
                  title={`Your best team for week ${week}`}
                  aside={
                    <span className={styles.projected}>
                      <b>{fmt(thisWeek.lineup.total)}</b> projected pts
                    </span>
                  }
                >
                  <WeeklyLineup model={model} week={week} rated={thisWeek} />
                </Section>
              ) : (
                <Section id="team" title="Your team" subtitle="Best lineup by current value">
                  <TeamLineup model={model} teams={teams} myRid={myRid} sparkMax={sparkMax} />
                </Section>
              )}
              <Section id="ideas" title="Trade ideas">
                <TradeIdeas ideas={ideas} searching={searching} teams={teams} onOpen={openIdea} />
              </Section>
            </div>

            <Section id="finder" title="Trade finder" className={styles.spaced}>
              <TradeFinder
                model={model}
                teams={teams}
                myRid={myRid}
                tradeScores={tradeScores}
                ideal={ideal}
                mode={finder.mode}
                playerId={finder.forRid === myRid ? finder.playerId : null}
                onMode={(mode) => setFinder({ forRid: myRid, mode, playerId: null })}
                onPlayer={(playerId) => setFinder({ ...finder, forRid: myRid, playerId })}
                onOpen={openIdea}
              />
            </Section>

            <Section id="analyzer" title="Trade analyzer" className={styles.spaced}>
              <TradeAnalyzer
                model={model}
                teams={teams}
                myRid={myRid}
                partnerRid={partnerRid}
                give={current.give}
                get={partnerRid === current.partnerRid ? current.get : new Set()}
                pool={pool}
                tradeScores={tradeScores}
                ideal={ideal}
                onPartner={(rid) => setAnalyzer({ ...current, partnerRid: rid, get: new Set() })}
                onToggleGive={(id) =>
                  setAnalyzer({ ...current, partnerRid, give: toggle(current.give, id) })
                }
                onToggleGet={(id) =>
                  setAnalyzer({ ...current, partnerRid, get: toggle(current.get, id) })
                }
              />
            </Section>
          </div>
        </PlayerCardProvider>
      </NewsProvider>
    </ScoreContext.Provider>
  );
}

/**
 * The visitor's leagues, grouped by sport. Sports the site doesn't support yet
 * are listed but can't be picked.
 */
function LeaguePicker({
  current,
  leagues,
  onLeague,
}: {
  current: { league_id: string; name: string };
  leagues: UserLeague[];
  onLeague: (leagueId: string) => void;
}) {
  const fieldId = useId();
  // The focus ring is for the keyboard: a mouse click that opens and closes the menu leaves none.
  const [pointer, setPointer] = useState(false);
  // A league opened from a shared link may not be one of the visitor's.
  const list = leagues.some((l) => l.league_id === current.league_id)
    ? leagues
    : [{ ...current, total_rosters: undefined, sport: "nfl" as const, season: "" }, ...leagues];
  const sports = [...new Set(list.map((l) => l.sport))];
  return (
    <div className={`field ${styles.picker}`}>
      <label htmlFor={fieldId}>League</label>
      <select
        id={fieldId}
        className={`select ${pointer ? styles.pointer : ""}`}
        value={current.league_id}
        onMouseDown={() => setPointer(true)}
        onKeyDown={() => setPointer(false)}
        onChange={(e) => onLeague(e.target.value)}
      >
        {sports.map((sport) => {
          const supported = SUPPORTED_SPORTS.has(sport);
          return (
            <optgroup
              key={sport}
              label={`${sport.toUpperCase()}${supported ? "" : " (coming soon)"}`}
            >
              {list
                .filter((l) => l.sport === sport)
                .map((l) => (
                  <option key={l.league_id} value={l.league_id} disabled={!supported}>
                    {l.name}
                  </option>
                ))}
            </optgroup>
          );
        })}
      </select>
    </div>
  );
}
