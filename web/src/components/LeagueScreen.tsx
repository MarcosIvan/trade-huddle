"use client";

import { useId, useMemo, useState } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { useTradeIdeas } from "@/hooks/useTradeIdeas";
import { fmt } from "@/lib/format";
import {
  defaultIdealRoster,
  freeAgentPool,
  idealCounts,
  onIr,
  playerScores,
  rosterPlayers,
  weeklyOutlook,
  type FinderMode,
  type IdealRoster as Ideal,
  type TradeIdea,
} from "@/lib/model";
import { ScoreContext } from "./ScoreContext";
import { NFL } from "@/lib/sports/nfl";
import { storage } from "@/lib/storage";
import { IdealRoster, IDEAL_MAX } from "./IdealRoster";
import { WeeklyLineup, weekLineup } from "./WeeklyLineup";
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

/** The saved ideal roster for one team, over the defaults; anything unreadable is ignored. */
function loadIdeal(key: `ideal:${string}`, defaults: Ideal): Ideal {
  try {
    const saved: unknown = JSON.parse(storage.get(key) ?? "null");
    if (!saved || typeof saved !== "object") return defaults;
    const out: Record<string, number> = { ...defaults };
    for (const pos of Object.keys(defaults)) {
      const n = (saved as Record<string, unknown>)[pos];
      if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= IDEAL_MAX) out[pos] = n;
    }
    return out;
  } catch {
    return defaults;
  }
}

function toggle(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function LeagueScreen({
  view,
  myRid,
  refreshing,
  onTeam,
  onRefresh,
  onLeave,
}: {
  view: LeagueView;
  myRid: number;
  refreshing: boolean;
  onTeam: (rid: number) => void;
  onRefresh: () => void;
  onLeave: () => void;
}) {
  const teamFieldId = useId();
  const { stats, league, teams, model, demo, notices } = view;
  // Player Scores (0-100); the owner-independent trade value (1-40) drives fairness.
  const scores = useMemo(() => playerScores(model, stats, teams, NFL), [model, stats, teams]);
  const tradeScores = useMemo(
    () => new Map([...scores].map(([id, s]) => [id, s.trade] as const)),
    [scores],
  );

  // Your ideal roster, saved per league and team; the league's default until you change it.
  const defaults = useMemo(() => defaultIdealRoster(model.slots, NFL), [model]);
  const idealKey = `ideal:${league.league_id}:${myRid}` as const;
  const [changedIdeal, setChangedIdeal] = useState<{ key: string; ideal: Ideal } | null>(null);
  const ideal = useMemo(
    () => (changedIdeal?.key === idealKey ? changedIdeal.ideal : loadIdeal(idealKey, defaults)),
    [changedIdeal, idealKey, defaults],
  );
  function applyIdeal(next: Ideal) {
    storage.set(idealKey, JSON.stringify(next));
    setChangedIdeal({ key: idealKey, ideal: next });
  }
  // What you have now at each position, players on injured reserve apart (they don't count).
  const myCounts = useMemo(() => {
    const mine = rosterPlayers(model, teams.find((t) => t.rid === myRid)?.playerIds ?? []);
    const ir: Record<string, number> = {};
    for (const p of mine) if (onIr(p)) ir[p.pos] = (ir[p.pos] ?? 0) + 1;
    return { active: idealCounts(mine), ir };
  }, [model, teams, myRid]);

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

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
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
      <div className="container">
        <header className={styles.header}>
          <div className={styles.titleBlock}>
            <h1 className={styles.title}>
              {league.name}
              {demo && <span className={styles.demoTag}>Fictional data</span>}
            </h1>
          </div>
          <div className={styles.controls}>
            <div className="field">
              <label htmlFor={teamFieldId}>View as</label>
              <select
                id={teamFieldId}
                className="select"
                value={myRid}
                onChange={(e) => onTeam(Number(e.target.value))}
              >
                {sortedTeams.map((t) => (
                  <option key={t.rid} value={t.rid}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.buttons}>
              {!demo && (
                <button className="btn" type="button" onClick={onRefresh} disabled={refreshing}>
                  {refreshing ? "Refreshing…" : "Refresh rosters"}
                </button>
              )}
              <button className="btn" type="button" onClick={onLeave}>
                Change league
              </button>
            </div>
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
            <IdealRoster
              key={`${idealKey}-${JSON.stringify(ideal)}`}
              applied={ideal}
              defaults={defaults}
              counts={myCounts.active}
              onIr={myCounts.ir}
              onApply={applyIdeal}
            />
            <TradeIdeas ideas={ideas} searching={searching} teams={teams} onOpen={openIdea} />
          </Section>
        </div>

        <Section id="finder" title="Trade finder">
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

        <Section id="analyzer" title="Trade analyzer" className={styles.analyzer}>
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
    </ScoreContext.Provider>
  );
}
