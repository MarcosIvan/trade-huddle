import { useId, useState } from "react";
import type { IdealRoster as Ideal } from "@/lib/model";
import styles from "./IdealRoster.module.css";

/** Most players of one position the form accepts. */
export const IDEAL_MAX = 15;

const same = (a: Ideal, b: Ideal) => Object.keys(a).every((pos) => a[pos] === b[pos]);

/**
 * How many players the owner wants at each position, bench included. Starts
 * from the applied ideal; the trade ideas only change when "Update trade ideas"
 * is pressed.
 */
export function IdealRoster({
  applied,
  defaults,
  counts,
  onApply,
}: {
  applied: Ideal;
  defaults: Ideal;
  /** How many players the team has now at each position. */
  counts: Readonly<Record<string, number>>;
  onApply: (ideal: Ideal) => void;
}) {
  const baseId = useId();
  const [draft, setDraft] = useState<Record<string, number>>({ ...applied });
  const positions = Object.keys(defaults);
  const changed = !same(draft, applied);

  return (
    <form
      className={`card ${styles.form}`}
      onSubmit={(e) => {
        e.preventDefault();
        onApply(draft);
      }}
    >
      <div className={styles.head}>
        <span className="label">Ideal roster</span>
        <p className="hint">
          Players you want at each position, bench included. Trades never take you further from it.
        </p>
      </div>
      <div className={styles.fields}>
        {positions.map((pos) => (
          <div key={pos} className={`field ${styles.field}`}>
            <label htmlFor={`${baseId}-${pos}`}>{pos}</label>
            <input
              id={`${baseId}-${pos}`}
              className="input num"
              type="number"
              inputMode="numeric"
              min={0}
              max={IDEAL_MAX}
              step={1}
              value={draft[pos] ?? 0}
              aria-describedby={`${baseId}-${pos}-have`}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n)) {
                  setDraft({ ...draft, [pos]: Math.min(IDEAL_MAX, Math.max(0, n)) });
                }
              }}
            />
            <span id={`${baseId}-${pos}-have`} className={styles.have}>
              You have {counts[pos] ?? 0}
            </span>
          </div>
        ))}
      </div>
      <div className={styles.buttons}>
        <button className="btn btn-primary" type="submit" disabled={!changed}>
          Update trade ideas
        </button>
        <button
          className="btn"
          type="button"
          disabled={same(draft, defaults)}
          onClick={() => setDraft({ ...defaults })}
        >
          Reset to default
        </button>
      </div>
    </form>
  );
}
