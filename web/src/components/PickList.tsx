import { useContext, useId } from "react";
import type { Player } from "@/lib/model";
import { PlayerCell, TRADE_VALUE_HINT, TradeValue } from "./Player";
import styles from "./PickList.module.css";
import { ScoreContext } from "./ScoreContext";

/** A team's players to pick for a trade, most valuable first, each with a checkbox. */
export function PickList({
  label,
  players,
  selected,
  onToggle,
}: {
  label: string;
  players: Player[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const labelId = useId();
  const scores = useContext(ScoreContext);
  const worth = (p: Player) => scores.get(p.id)?.trade ?? p.vorp;
  const sorted = [...players].sort((a, b) => worth(b) - worth(a) || b.value - a.value);
  return (
    <div>
      <span className="label" id={labelId}>
        {label}
      </span>
      <div className={styles.picklist} role="group" aria-labelledby={labelId}>
        {sorted.length === 0 && <p className="hint">Empty roster.</p>}
        {sorted.map((p) => {
          const on = selected.has(p.id);
          return (
            <label key={p.id} className={`${styles.pick} ${on ? styles.on : ""}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} />
              <PlayerCell player={p} showScore={false} link={false} />
              <span className={`num ${styles.value}`} title={TRADE_VALUE_HINT}>
                <TradeValue player={p} />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
