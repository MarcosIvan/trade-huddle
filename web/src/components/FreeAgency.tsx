import { useMemo, useState } from "react";
import type { Team } from "@/lib/league";
import {
  listable,
  makeScorer,
  rosterPlayers,
  suggestPicks,
  type FreeAgentPool,
  type IdealRoster,
  type LeagueSettings,
  type Model,
  type PickResult,
  type Player,
  type PlayerSchedule,
  type StatsFile,
} from "@/lib/model";
import { FreeAgentList } from "./FreeAgentList";
import { PickAnalyzer } from "./PickAnalyzer";
import { PickIdeas } from "./PickIdeas";
import { Section } from "./Section";
import { useSport } from "./SportContext";
import styles from "./FreeAgency.module.css";

interface Move {
  addId: string | null;
  dropId: string | null;
  /** The analyzer's position filter; null follows the player to add. */
  pos: string | null;
}

/** Scrolls to a section, without motion for those who ask for less. */
function scrollToSection(id: string) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
}

/**
 * The free agency tab: the league's free agents with stats or projections,
 * pick ideas beside them (add one, drop one) and the pick analyzer below.
 */
export function FreeAgency({
  model,
  stats,
  league,
  teams,
  myRid,
  pool,
  tradeScores,
  ideal,
  schedules,
}: {
  model: Model;
  stats: StatsFile;
  league: LeagueSettings;
  teams: Team[];
  myRid: number;
  /** Free agents who could help a lineup, by position (trades' free agent pool). */
  pool: FreeAgentPool;
  tradeScores: ReadonlyMap<string, number>;
  ideal: IdealRoster;
  schedules: ReadonlyMap<string, PlayerSchedule>;
}) {
  const sport = useSport();
  const score = useMemo(() => makeScorer(stats.keys, league.scoring_settings), [stats, league]);
  const rostered = useMemo(() => new Set(teams.flatMap((t) => t.playerIds)), [teams]);
  const mine = useMemo(() => {
    const team = teams.find((t) => t.rid === myRid);
    return rosterPlayers(model, team?.playerIds ?? [], team?.reserveIds);
  }, [model, teams, myRid]);

  // Every free agent the analyzer can add, most valuable first.
  const freeAgents = useMemo(
    () =>
      Object.values(model.players)
        .filter((p) => !rostered.has(p.id) && listable(p))
        .sort((a, b) => (tradeScores.get(b.id) ?? 0) - (tradeScores.get(a.id) ?? 0)),
    [model, rostered, tradeScores],
  );

  const picks = useMemo(
    () => suggestPicks(mine, pool, model, sport, tradeScores, ideal),
    [mine, pool, model, sport, tradeScores, ideal],
  );

  // The analyzer starts on the first pick idea until the user picks a player.
  const [move, setMove] = useState<(Move & { forRid: number }) | null>(null);
  const chosen = move?.forRid === myRid ? move : null;
  const addId = chosen ? chosen.addId : (picks[0]?.add.id ?? null);
  const dropId = chosen ? chosen.dropId : (picks[0]?.drop.id ?? null);
  const addPos = freeAgents.find((p) => p.id === addId)?.pos;
  const pos = chosen?.pos ?? addPos ?? sport.positions[0]!;
  const update = (next: Partial<Move>) =>
    setMove({ addId, dropId, pos: chosen?.pos ?? null, ...next, forRid: myRid });

  function openPick(pick: PickResult) {
    update({ addId: pick.add.id, dropId: pick.drop.id, pos: pick.add.pos });
    scrollToSection("pick-analyzer");
  }
  function analyze(player: Player) {
    update({ addId: player.id, pos: player.pos });
    scrollToSection("pick-analyzer");
  }

  return (
    <>
      <div className={styles.grid}>
        <Section
          id="free-agents"
          title="Free agents"
          subtitle="Players on no roster in this league"
        >
          <FreeAgentList
            model={model}
            stats={stats}
            score={score}
            rostered={rostered}
            onAnalyze={analyze}
          />
        </Section>
        <Section id="pick-ideas" title="Pick ideas">
          <PickIdeas picks={picks} onOpen={openPick} />
        </Section>
      </div>

      <Section id="pick-analyzer" title="Pick analyzer" className={styles.spaced}>
        <PickAnalyzer
          model={model}
          mine={mine}
          freeAgents={freeAgents}
          addId={addId}
          dropId={dropId}
          pos={pos}
          tradeScores={tradeScores}
          ideal={ideal}
          schedules={schedules}
          onAdd={(id) => update({ addId: id })}
          onDrop={(id) => update({ dropId: id })}
          onPos={(next) => update({ pos: next })}
        />
      </Section>
    </>
  );
}
