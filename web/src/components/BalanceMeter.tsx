import { fmt } from "@/lib/format";
import { verdict, type Verdict } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import styles from "./BalanceMeter.module.css";

const ICONS: Record<Verdict["cls"], string> = { fair: "✓", lean: "!", skew: "✕" };

export function VerdictBadge({ result }: { result: Verdict }) {
  return (
    <span className={`${styles.verdict} ${styles[result.cls]}`}>
      <span className={styles.icon} aria-hidden="true">
        {ICONS[result.cls]}
      </span>
      {result.text}
    </span>
  );
}

/** Value above replacement sent versus received, with the balance verdict. */
export function BalanceMeter({ vGive, vGet }: { vGive: number; vGet: number }) {
  const total = vGive + vGet || 1;
  const give = Math.max(2, (vGive / total) * 100);
  const get = Math.max(2, (vGet / total) * 100);
  return (
    <div className={styles.meter}>
      <VerdictBadge result={verdict({ vGive, vGet }, NFL.model)} />
      <div
        className={styles.bar}
        role="img"
        aria-label={`Value above replacement: you send ${fmt(vGive)}, you get ${fmt(vGet)}`}
      >
        <span className={styles.give} style={{ flexGrow: give }} />
        <span className={styles.get} style={{ flexGrow: get }} />
      </div>
      <div className={styles.row} aria-hidden="true">
        <span>
          You send <b>{fmt(vGive)}</b>
        </span>
        <span>
          You get <b>{fmt(vGet)}</b>
        </span>
      </div>
    </div>
  );
}
