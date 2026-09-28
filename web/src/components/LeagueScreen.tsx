"use client";

import { useId, useMemo, useState } from "react";
import type { LeagueView } from "@/hooks/useLeague";
import { useTradeIdeas } from "@/hooks/useTradeIdeas";
import { shortDate } from "@/lib/format";
import {
  freeAgentPool,
  playerScores,
  rosterPlayers,
  weeklyOutlook,
  type TradeIdea,
} from "@/lib/model";
import { ScoreContext } from "./ScoreContext";
import { NFL } from "@/lib/sports/nfl";
import { WeeklyLineup } from "./WeeklyLineup";
import { MethodNotes } from "./MethodNotes";
import { Notices } from "./Notices";
import { Section } from "./Section";
import { TeamLineup } from "./TeamLineup";
import { TradeAnalyzer } from "./TradeAnalyzer";
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
  // Player Scores (0-100); the owner-independent "trade score" drives fairness.
  const scores = useMemo(() => playerScores(model, stats, teams), [model, stats, teams]);
  const tradeScores = useMemo(
    () => new Map([...scores].map(([id, s]) => [id, s.trade] as const)),
    [scores],
  );
  const { ideas, searching } = useTradeIdeas(model, teams, myRid, tradeScores);

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

  // Players on no roster in this league: who you could pick up after an uneven trade.
  const pool = useMemo(
    () => freeAgentPool(model, new Set(teams.flatMap((t) => t.playerIds))),
    [model, teams],
  );

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams],
  );
  const weeks = stats.weeks.length
    ? `weeks ${stats.weeks[0]}–${stats.weeks[stats.weeks.length - 1]} of ${stats.season}`
    : `no ${stats.season} games yet`;

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
            <p className={styles.meta}>
              {teams.length} teams · {weeks} · stats updated {shortDate(stats.generated_at)}
            </p>
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
          <Section
            id="team"
            title="Your team"
            subtitle={
              week && outlook ? "Best lineup for this week" : "Best lineup by current value"
            }
          >
            {week && outlook ? (
              <WeeklyLineup
                model={model}
                teams={teams}
                myRid={myRid}
                week={week}
                outlook={outlook}
              />
            ) : (
              <TeamLineup model={model} teams={teams} myRid={myRid} sparkMax={sparkMax} />
            )}
          </Section>
          <Section
            id="ideas"
            title="Trade ideas"
            subtitle="Only deals that improve both starting lineups"
          >
            <TradeIdeas ideas={ideas} searching={searching} teams={teams} onOpen={openIdea} />
          </Section>
        </div>

        <Section
          id="analyzer"
          title="Trade analyzer"
          subtitle="Pick players on each side to see the impact and the balance"
          className={styles.analyzer}
        >
          <TradeAnalyzer
            model={model}
            stats={stats}
            teams={teams}
            myRid={myRid}
            partnerRid={partnerRid}
            give={current.give}
            get={partnerRid === current.partnerRid ? current.get : new Set()}
            sparkMax={sparkMax}
            pool={pool}
            tradeScores={tradeScores}
            onPartner={(rid) => setAnalyzer({ ...current, partnerRid: rid, get: new Set() })}
            onToggleGive={(id) =>
              setAnalyzer({ ...current, partnerRid, give: toggle(current.give, id) })
            }
            onToggleGet={(id) =>
              setAnalyzer({ ...current, partnerRid, get: toggle(current.get, id) })
            }
          />
        </Section>

        <MethodNotes stats={stats} repl={model.repl} />
      </div>
    </ScoreContext.Provider>
  );
}
