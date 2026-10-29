import { useContext, useId } from "react";
import type { Player } from "@/lib/model";
import { PlayerCell, TradeValue, useTradeValueHint } from "./Player";
import styles from "./PickList.module.css";
import { ScoreContext } from "./ScoreContext";

/**
 * A team's players to pick for a trade, most valuable first, each with a
 * checkbox (or a radio button when only one can be picked).
 */
export function PickList({
  label,
  players,
  selected,
  onToggle,
  single = false,
}: {
  label: string;
  players: Player[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Only one player can be picked. */
  single?: boolean;
}) {
  const labelId = useId();
  const TRADE_VALUE_HINT = useTradeValueHint();
  const scores = useContext(ScoreContext);
  const worth = (p: Player) => scores.get(p.id)?.trade ?? p.vorp;
  const sorted = [...players].sort((a, b) => worth(b) - worth(a) || b.value - a.value);
  return (
    <div>
      <span className="label" id={labelId}>
        {label}
      </span>
      <div
        className={styles.picklist}
        role={single ? "radiogroup" : "group"}
        aria-labelledby={labelId}
      >
        {sorted.length === 0 && <p className="hint">Empty roster.</p>}
        {sorted.map((p) => {
          const on = selected.has(p.id);
          return (
            <label key={p.id} className={`${styles.pick} ${on ? styles.on : ""}`}>
              <input
                type={single ? "radio" : "checkbox"}
                name={single ? labelId : undefined}
                checked={on}
                onChange={() => onToggle(p.id)}
              />
              <PlayerCell player={p} link={false} />
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
