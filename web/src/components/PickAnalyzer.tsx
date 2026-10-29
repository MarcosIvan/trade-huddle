import { useMemo } from "react";
import {
  dropCandidates,
  evaluatePick,
  sideChange,
  type IdealRoster,
  type Model,
  type Player,
  type PlayerSchedule,
} from "@/lib/model";
import { PickMeter } from "./BalanceMeter";
import { IdeaChip } from "./IdeaFrame";
import { PickList } from "./PickList";
import { Delta } from "./Player";
import { Segmented } from "./Segmented";
import { useSport } from "./SportContext";
import { TradeSide } from "./TradeSide";
import styles from "./PickAnalyzer.module.css";

/** Free agents listed at the chosen position, the most valuable first. */
const SHOWN_FREE_AGENTS = 50;

/**
 * Add one free agent and drop one of your players: the same result as the
 * trade analyzer (trade value meter, both sides with their schedules, what
 * your starters and bench gain, lineup problems), with a pickup verdict.
 */
export function PickAnalyzer({
  model,
  mine,
  freeAgents,
  addId,
  dropId,
  pos,
  tradeScores,
  ideal,
  schedules,
  onAdd,
  onDrop,
  onPos,
}: {
  model: Model;
  /** Your roster. */
  mine: Player[];
  /** Every free agent you could add, most valuable first. */
  freeAgents: readonly Player[];
  addId: string | null;
  dropId: string | null;
  /** The position whose free agents are listed. */
  pos: string;
  tradeScores: ReadonlyMap<string, number>;
  ideal: IdealRoster;
  schedules: ReadonlyMap<string, PlayerSchedule>;
  onAdd: (id: string | null) => void;
  onDrop: (id: string | null) => void;
  onPos: (pos: string) => void;
}) {
  const sport = useSport();
  const add = freeAgents.find((p) => p.id === addId) ?? null;
  const drops = useMemo(() => dropCandidates(mine, sport.positions), [mine, sport]);
  const drop = drops.find((p) => p.id === dropId) ?? null;
  // The chosen position's free agents, with the one picked when he plays there.
  const listed = useMemo(() => {
    const top = freeAgents.filter((p) => p.pos === pos).slice(0, SHOWN_FREE_AGENTS);
    return add && add.pos === pos && !top.includes(add) ? [add, ...top] : top;
  }, [freeAgents, pos, add]);

  const result = useMemo(
    () => (add && drop ? evaluatePick(mine, add, drop, model, sport, tradeScores, ideal) : null),
    [mine, add, drop, model, sport, tradeScores, ideal],
  );

  return (
    <>
      <div className={styles.pickers}>
        <div className={styles.drop}>
          <PickList
            label="You drop"
            players={drops}
            selected={new Set(dropId ? [dropId] : [])}
            onToggle={(id) => onDrop(id === dropId ? null : id)}
            single
          />
        </div>
        <div className={styles.filter}>
          <Segmented
            legend="Position"
            options={sport.positions.map((p) => ({ value: p, label: p }))}
            value={pos}
            onChange={onPos}
          />
        </div>
        <div className={styles.add}>
          <PickList
            label={`You add (${pos} free agents)`}
            players={listed}
            selected={new Set(addId ? [addId] : [])}
            onToggle={(id) => onAdd(id === addId ? null : id)}
            single
          />
        </div>
      </div>

      <div aria-live="polite">
        {!result ? (
          <p className={`hint ${styles.prompt}`}>
            Pick a player to drop and a free agent to add to see what the move does.
          </p>
        ) : (
          <div className={`card ${styles.result}`}>
            <h3 className="visually-hidden">Pickup result</h3>
            <PickMeter sDrop={result.sDrop} sAdd={result.sAdd} level={result.level} />
            <div className={styles.chips}>
              <IdeaChip>
                Your starters <Delta value={result.dMe} />
              </IdeaChip>
              <IdeaChip title="Change in your best backups (20% of their points)">
                Your bench <Delta value={result.depthMe} />
              </IdeaChip>
            </div>
            <div className={styles.teams}>
              <TradeSide
                title="You drop"
                change={sideChange(result.sDrop, result.sAdd, [result.drop], [result.add])}
                players={[result.drop]}
                schedules={schedules}
              />
              <TradeSide
                title="You add"
                change={sideChange(result.sAdd, result.sDrop, [result.add], [result.drop])}
                players={[result.add]}
                schedules={schedules}
              />
            </div>
            {/* Roster balance is each manager's call: only lineup problems are shown. */}
            {result.lineupWarnings.map((w) => (
              <p key={w} className={`hint ${styles.warning}`}>
                <span aria-hidden="true">⚠ </span>
                {w}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
