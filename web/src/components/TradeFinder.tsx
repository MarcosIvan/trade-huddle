import { useContext, useId, useMemo } from "react";
import { fmt } from "@/lib/format";
import { teamLabel, type Team } from "@/lib/league";
import {
  isTrueMatch,
  rosterPlayers,
  type FinderMode,
  type IdealRoster,
  type Model,
  type Player,
  type TradeIdea,
} from "@/lib/model";
import { useTradeFinder } from "@/hooks/useTradeFinder";
import { ScoreContext } from "./ScoreContext";
import { IdeaCard } from "./TradeIdeas";
import styles from "./TradeFinder.module.css";

const MODES: { mode: FinderMode; label: string }[] = [
  { mode: "sell", label: "Sell a player" },
  { mode: "get", label: "Get a player" },
];

/**
 * Deals around one chosen player: sell one of yours to any team, or get one
 * from another team. Shows three deals, best first, with every true match
 * starred; when too few pass every rule, the closest ones fill in with what
 * they are missing.
 */
export function TradeFinder({
  model,
  teams,
  myRid,
  tradeScores,
  ideal,
  mode,
  playerId,
  onMode,
  onPlayer,
  onOpen,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
  tradeScores: ReadonlyMap<string, number>;
  ideal: IdealRoster;
  mode: FinderMode;
  playerId: string | null;
  onMode: (mode: FinderMode) => void;
  onPlayer: (id: string | null) => void;
  onOpen: (idea: TradeIdea) => void;
}) {
  const modeName = useId();
  const playerFieldId = useId();
  const scores = useContext(ScoreContext);
  const worth = (p: Player) => scores.get(p.id)?.trade ?? p.vorp;
  const { ideas, searching } = useTradeFinder(
    model,
    teams,
    myRid,
    tradeScores,
    ideal,
    mode,
    playerId,
  );

  // Your players to sell, or every other team's players to get, best value first.
  const groups = useMemo(() => {
    const byValue = (list: Player[]) => [...list].sort((a, b) => worth(b) - worth(a));
    const teamsShown =
      mode === "sell"
        ? teams.filter((t) => t.rid === myRid)
        : teams.filter((t) => t.rid !== myRid).sort((a, b) => a.name.localeCompare(b.name));
    return teamsShown.map((t) => ({
      team: t,
      players: byValue(rosterPlayers(model, t.playerIds)),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, teams, myRid, model, scores]);

  const option = (p: Player) => (
    <option key={p.id} value={p.id}>
      {p.name} · {p.pos} · {fmt(worth(p))}
    </option>
  );
  const chosen = playerId ? model.players[playerId] : undefined;
  const teamOf = (rid: number) => teams.find((t) => t.rid === rid);

  return (
    <div className={styles.finder}>
      <div className={styles.controls}>
        <fieldset className={styles.modes}>
          <legend className="label">I want to</legend>
          <div className={styles.segmented}>
            {MODES.map((m) => (
              <label
                key={m.mode}
                className={`${styles.segment} ${mode === m.mode ? styles.on : ""}`}
              >
                <input
                  type="radio"
                  name={modeName}
                  value={m.mode}
                  checked={mode === m.mode}
                  onChange={() => onMode(m.mode)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className={`field ${styles.player}`}>
          <label htmlFor={playerFieldId}>Player</label>
          <select
            id={playerFieldId}
            className="select"
            value={playerId ?? ""}
            onChange={(e) => onPlayer(e.target.value || null)}
          >
            <option value="">Choose a player…</option>
            {mode === "sell"
              ? groups[0]?.players.map(option)
              : groups.map(({ team, players }) => (
                  <optgroup key={team.rid} label={teamLabel(team)}>
                    {players.map(option)}
                  </optgroup>
                ))}
          </select>
        </div>
      </div>

      <div aria-live="polite" aria-busy={searching}>
        {!chosen ? null : searching ? (
          <p className={`card ${styles.status}`}>Searching deals for {chosen.name}…</p>
        ) : ideas.length > 0 ? (
          <div className={styles.list}>
            {ideas.every((r) => r.problems) && (
              <p className={`card ${styles.status}`}>
                <b>No deal for {chosen.name} passes every rule.</b> These are the closest ones and
                what they are missing.
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
                problems={idea.problems}
                onOpen={() => onOpen(idea)}
              />
            ))}
          </div>
        ) : (
          <p className={`card ${styles.status}`}>
            No deal around {chosen.name} could be built from these rosters.
          </p>
        )}
      </div>
    </div>
  );
}
