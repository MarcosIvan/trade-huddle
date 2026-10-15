import { useContext, useId, useMemo } from "react";
import { fmt } from "@/lib/format";
import { teamLabel, type Team } from "@/lib/league";
import {
  ideaSkipped,
  isTrueMatch,
  rosterPlayers,
  TARGET_TIERS,
  type FinderMode,
  type IdealRoster,
  type Model,
  type Player,
  type TradeIdea,
} from "@/lib/model";
import type { FinderQuery } from "@/lib/tradeSearch";
import { useTradeFinder } from "@/hooks/useTradeFinder";
import { ScoreContext } from "./ScoreContext";
import { Segmented } from "./Segmented";
import { useSport } from "./SportContext";
import { IdeaCard } from "./TradeIdeas";
import { PlayerSearch } from "./PlayerSearch";
import styles from "./TradeFinder.module.css";

/** What the finder is set to: sell or get one player, or get a top player at a position. */
export interface FinderChoice {
  mode: FinderMode | "target";
  /** The player to sell or get, or the one you offer for a position (null: any). */
  playerId: string | null;
  /** Target mode: the position you want (null: the first one offered) and his tier. */
  pos: string | null;
  top: number;
}

export const NO_FINDER_CHOICE: FinderChoice = { mode: "sell", playerId: null, pos: null, top: 10 };

const MODES: { value: FinderChoice["mode"]; label: string }[] = [
  { value: "sell", label: "Sell a player" },
  { value: "get", label: "Get a player" },
  { value: "target", label: "Get a position" },
];

/**
 * Deals around one chosen player (sell one of yours to any team, or get one
 * from another team) or for a top player at a position, sending one of yours
 * when chosen. Shows three deals, best first, with every true match starred;
 * when too few pass every rule, the closest ones fill in.
 */
export function TradeFinder({
  model,
  teams,
  myRid,
  tradeScores,
  ideal,
  choice,
  onChoice,
  onOpen,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
  tradeScores: ReadonlyMap<string, number>;
  ideal: IdealRoster;
  choice: FinderChoice;
  onChoice: (choice: FinderChoice) => void;
  onOpen: (idea: TradeIdea) => void;
}) {
  const playerFieldId = useId();
  const posFieldId = useId();
  const topFieldId = useId();
  const scores = useContext(ScoreContext);
  const sport = useSport();
  const worth = (p: Player) => scores.get(p.id)?.trade ?? p.vorp;
  const { mode, playerId, top } = choice;
  const targeting = mode === "target";

  // Positions worth targeting: traded ones, minus those trade ideas leave out here.
  const positions = useMemo(() => {
    const skipped = ideaSkipped(model.slots, sport);
    return (sport.tradePositions ?? sport.positions).filter((pos) => !skipped.has(pos));
  }, [model, sport]);
  const pos = choice.pos && positions.includes(choice.pos) ? choice.pos : (positions[0] ?? "");

  const query = useMemo<FinderQuery | null>(() => {
    if (targeting) return pos ? { mode, target: { pos, top, offerId: playerId } } : null;
    return playerId ? { mode, playerId } : null;
  }, [targeting, mode, pos, top, playerId]);
  const { ideas: found, searching } = useTradeFinder(
    model,
    teams,
    myRid,
    tradeScores,
    ideal,
    query,
    sport,
  );
  // Never more than the sport's three suggestions.
  const ideas = found.slice(0, sport.model.maxSuggestions);

  // Your players to sell or offer, or every other team's players to get, best value first.
  const groups = useMemo(() => {
    const byValue = (list: Player[]) => [...list].sort((a, b) => worth(b) - worth(a));
    const teamsShown =
      mode === "get"
        ? teams.filter((t) => t.rid !== myRid).sort((a, b) => a.name.localeCompare(b.name))
        : teams.filter((t) => t.rid === myRid);
    return teamsShown.map((t) => ({
      team: t,
      players: byValue(rosterPlayers(model, t.playerIds)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, teams, myRid, model, scores]);

  // Get mode: every other team's players, searched by name, best value first.
  const searchable = useMemo(
    () =>
      mode === "get"
        ? groups
            .flatMap(({ team, players }) =>
              players.map((p) => ({ player: p, where: teamLabel(team), value: worth(p) })),
            )
            .sort((a, b) => b.value - a.value)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, groups],
  );

  const option = (p: Player) => (
    <option key={p.id} value={p.id}>
      {p.name} · {p.pos} · {fmt(worth(p))}
    </option>
  );
  const chosen = playerId ? model.players[playerId] : undefined;
  const subject = targeting
    ? `a top ${top} ${pos}${chosen ? ` for ${chosen.name}` : ""}`
    : chosen?.name;
  const teamOf = (rid: number) => teams.find((t) => t.rid === rid);

  return (
    <div className={styles.finder}>
      <div className={styles.controls}>
        <Segmented
          legend="I want to"
          options={MODES}
          value={mode}
          onChange={(m) => onChoice({ ...choice, mode: m, playerId: null })}
        />
        {targeting && (
          <div className={styles.target}>
            <div className="field">
              <label htmlFor={posFieldId}>Position</label>
              <select
                id={posFieldId}
                className="select"
                value={pos}
                onChange={(e) => onChoice({ ...choice, pos: e.target.value })}
              >
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={topFieldId}>Ranked</label>
              <select
                id={topFieldId}
                className="select"
                value={top}
                onChange={(e) => onChoice({ ...choice, top: Number(e.target.value) })}
              >
                {TARGET_TIERS.map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {mode === "get" ? (
          <div className={styles.player}>
            <PlayerSearch
              label="Player"
              players={searchable}
              selectedId={playerId}
              onSelect={(id) => onChoice({ ...choice, playerId: id })}
            />
          </div>
        ) : (
          <div className={`field ${styles.player}`}>
            <label htmlFor={playerFieldId}>{targeting ? "Player you offer" : "Player"}</label>
            <select
              id={playerFieldId}
              className="select"
              value={playerId ?? ""}
              onChange={(e) => onChoice({ ...choice, playerId: e.target.value || null })}
            >
              <option value="">{targeting ? "Any of yours" : "Choose a player…"}</option>
              {groups[0]?.players.map(option)}
            </select>
          </div>
        )}
      </div>

      {targeting && (
        <p className={styles.hint}>
          Two-for-two deals that bring you a {pos} ranked in the league&apos;s top {top} by trade
          value.
        </p>
      )}

      <div aria-live="polite" aria-busy={searching}>
        {!query ? null : searching ? (
          <p className={`card ${styles.status}`}>Searching deals for {subject}…</p>
        ) : ideas.length > 0 ? (
          <div className={styles.list}>
            {ideas.every((r) => r.problems) && (
              <p className={`card ${styles.status}`}>
                <b>No deal for {subject} passes every rule.</b> These are the closest ones.
              </p>
            )}
            {ideas.map((idea, i) => (
              <IdeaCard
                key={`${idea.partner}-${idea.give.map((p) => p.id).join()}-${idea.get.map((p) => p.id).join()}`}
                idPrefix="finder"
                idea={idea}
                index={i}
                partner={teamOf(idea.partner)}
                star={
                  !idea.problems && isTrueMatch(idea)
                    ? "match"
                    : i === 0 && !ideas.some((r) => !r.problems && isTrueMatch(r))
                      ? "closest"
                      : null
                }
                onOpen={() => onOpen(idea)}
              />
            ))}
          </div>
        ) : (
          <p className={`card ${styles.status}`}>
            {targeting
              ? `No deal for ${subject} could be built from these rosters.`
              : `No deal around ${subject} could be built from these rosters.`}
          </p>
        )}
      </div>
    </div>
  );
}
