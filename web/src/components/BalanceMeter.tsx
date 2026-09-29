import { fmt } from "@/lib/format";
import { fairnessLevel, type FairnessLevel } from "@/lib/model";
import styles from "./BalanceMeter.module.css";

const LABELS: Record<FairnessLevel, { icon: string; text: string }> = {
  green: { icon: "✓", text: "Fair trade" },
  yellow: { icon: "!", text: "Could work, but not quite fair" },
  red: { icon: "✕", text: "Don't do it" },
};

/** Traffic-light fairness: icon, words and percentage, so it reads without color. */
export function FairnessBadge({ fairness, favors }: { fairness: number; favors: string | null }) {
  const level = fairnessLevel(fairness);
  const { icon, text } = LABELS[level];
  return (
    <span className={`${styles.verdict} ${styles[level]}`}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      {text} · {Math.round(fairness * 100)}%
      {level !== "green" && favors && <span className={styles.favors}>favors {favors}</span>}
    </span>
  );
}

/** Trade value sent versus received, with the fairness badge. */
export function BalanceMeter({
  sGive,
  sGet,
  fairness,
}: {
  sGive: number;
  sGet: number;
  fairness: number;
}) {
  const total = sGive + sGet || 1;
  const give = Math.max(2, (sGive / total) * 100);
  const get = Math.max(2, (sGet / total) * 100);
  const favors = sGet > sGive ? "you" : sGive > sGet ? "them" : null;
  return (
    <div className={styles.meter}>
      <FairnessBadge fairness={fairness} favors={favors} />
      <div
        className={styles.bar}
        role="img"
        aria-label={`Trade value: you send ${fmt(sGive)}, you get ${fmt(sGet)}`}
      >
        <span className={styles.give} style={{ flexGrow: give }} />
        <span className={styles.get} style={{ flexGrow: get }} />
      </div>
      <div className={styles.row} aria-hidden="true">
        <span>
          Value you send <b>{fmt(sGive)}</b>
        </span>
        <span>
          Value you get <b>{fmt(sGet)}</b>
        </span>
      </div>
    </div>
  );
}
