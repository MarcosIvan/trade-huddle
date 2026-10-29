import type { PickResult } from "@/lib/model";
import { PickMeter } from "./BalanceMeter";
import { IdeaChip, IdeaFrame, IdeaSide } from "./IdeaFrame";
import { Delta } from "./Player";
import styles from "./TradeIdeas.module.css";

/** One pickup: the free agent to add, the player to drop and what it does to your team. */
export function PickCard({
  pick,
  index,
  star,
  onOpen,
}: {
  pick: PickResult;
  index: number;
  star: boolean;
  onOpen: () => void;
}) {
  return (
    <IdeaFrame
      titleId={`pick-${index}-title`}
      title={`Add ${pick.add.name}, drop ${pick.drop.name}`}
      star={star ? "Best pickup" : null}
      sides={
        <>
          <IdeaSide label="You drop" players={[pick.drop]} />
          <IdeaSide label="You add" players={[pick.add]} />
        </>
      }
      chips={
        <>
          <IdeaChip>
            Your starters <Delta value={pick.dMe} />
          </IdeaChip>
          {Math.abs(pick.depthMe) >= 0.1 && (
            <IdeaChip title="Change in your best backups (20% of their points)">
              Your bench <Delta value={pick.depthMe} />
            </IdeaChip>
          )}
        </>
      }
      meter={<PickMeter sDrop={pick.sDrop} sAdd={pick.sAdd} level={pick.level} />}
      onOpen={onOpen}
    />
  );
}

/** The best free agent pickups for your roster, one for one, best first. */
export function PickIdeas({
  picks,
  onOpen,
}: {
  picks: readonly PickResult[];
  onOpen: (pick: PickResult) => void;
}) {
  if (picks.length === 0) {
    return (
      <div className={`card ${styles.empty}`}>
        <p>
          <b>No free agent is an upgrade on your roster right now.</b>
        </p>
        <p className="hint">
          Every free agent worth adding is worth less than the players you could drop. Check the
          list after the next round of games, or try a move in the analyzer below.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.list}>
      {picks.map((pick, i) => (
        <PickCard
          key={`${pick.add.id}-${pick.drop.id}`}
          pick={pick}
          index={i}
          star={i === 0 && pick.level === "green"}
          onOpen={() => onOpen(pick)}
        />
      ))}
    </div>
  );
}
