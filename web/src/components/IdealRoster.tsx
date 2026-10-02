import { useId, useState } from "react";
import { type IdealRoster as Ideal } from "@/lib/model";
import styles from "./IdealRoster.module.css";

/** Most players of one position the form accepts. */
export const IDEAL_MAX = 15;

const same = (a: Ideal, b: Ideal) => Object.keys(a).every((pos) => a[pos] === b[pos]);
const clamp = (n: number) => Math.min(IDEAL_MAX, Math.max(0, n));
const plural = (n: number) => (n === 1 ? "player" : "players");

/**
 * How many players the owner wants at each position, bench included. Starts
 * from the applied ideal; the trade ideas only change when "Update trade ideas"
 * is pressed, and only when the total is exactly `size` (the IR spots apart).
 */
export function IdealRoster({
  applied,
  defaults,
  size,
  counts,
  onIr,
  onApply,
}: {
  applied: Ideal;
  defaults: Ideal;
  /** Players the ideal must add up to: the league's roster spots for these positions. */
  size: number;
  /** How many players the team has now at each position, the IR spots left out. */
  counts: Readonly<Record<string, number>>;
  /** Players in the IR spots at each position: shown apart, never counted. */
  onIr: Readonly<Record<string, number>>;
  onApply: (ideal: Ideal) => void;
}) {
  const baseId = useId();
  const [draft, setDraft] = useState<Record<string, number>>({ ...applied });
  const positions = Object.keys(defaults);
  const total = positions.reduce((s, pos) => s + (draft[pos] ?? 0), 0);
  const off = total - size;
  const changed = !same(draft, applied);
  const set = (pos: string, n: number) => setDraft({ ...draft, [pos]: clamp(n) });
  const limit =
    off > 0
      ? `Exactly ${size} players in total, IR apart. Remove ${off} ${plural(off)} to update.`
      : `Exactly ${size} players in total, IR apart. Add ${-off} ${plural(-off)} to update.`;

  return (
    <form
      className={`card ${styles.form}`}
      aria-labelledby={`${baseId}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        if (changed && off === 0) onApply(draft);
      }}
    >
      <h3 className={styles.title} id={`${baseId}-title`}>
        Ideal roster
      </h3>
      <div className={styles.fields}>
        {positions.map((pos) => {
          const n = draft[pos] ?? 0;
          return (
            <div key={pos} className={`field ${styles.field}`}>
              <label htmlFor={`${baseId}-${pos}`}>{pos}</label>
              <div className={styles.stepper}>
                <button
                  className={styles.step}
                  type="button"
                  aria-label={`One fewer ${pos}`}
                  disabled={n <= 0}
                  onClick={() => set(pos, n - 1)}
                >
                  −
                </button>
                <input
                  id={`${baseId}-${pos}`}
                  className={`num ${styles.count}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={IDEAL_MAX}
                  step={1}
                  value={n}
                  aria-describedby={`${baseId}-${pos}-have`}
                  onChange={(e) => {
                    const next = Math.round(Number(e.target.value));
                    if (Number.isFinite(next)) set(pos, next);
                  }}
                />
                <button
                  className={styles.step}
                  type="button"
                  aria-label={`One more ${pos}`}
                  disabled={n >= IDEAL_MAX}
                  onClick={() => set(pos, n + 1)}
                >
                  +
                </button>
              </div>
              <span id={`${baseId}-${pos}-have`} className={styles.have}>
                You have {counts[pos] ?? 0}
                {onIr[pos] ? ` + ${onIr[pos]} IR` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.buttons}>
        <span className={styles.submit}>
          {/* aria-disabled keeps the button focusable, so the limit can be read on focus too. */}
          <button
            className="btn btn-primary"
            type="submit"
            disabled={!changed && off === 0}
            aria-disabled={off !== 0 || undefined}
            aria-describedby={off !== 0 ? `${baseId}-limit` : undefined}
          >
            Update trade ideas
          </button>
          {off !== 0 && (
            <span id={`${baseId}-limit`} role="tooltip" className={styles.tooltip}>
              {limit}
            </span>
          )}
        </span>
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
