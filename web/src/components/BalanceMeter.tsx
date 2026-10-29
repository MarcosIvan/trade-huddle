import type { ReactNode } from "react";
import { fmt, signed } from "@/lib/format";
import { fairnessLevel, type FairnessLevel, type PickLevel } from "@/lib/model";
import styles from "./BalanceMeter.module.css";

const LABELS: Record<FairnessLevel, { icon: string; text: string }> = {
  green: { icon: "✓", text: "Fair trade" },
  yellow: { icon: "!", text: "Could work, but not quite fair" },
  red: { icon: "✕", text: "Don't do it" },
};

const PICK_LABELS: Record<PickLevel, { icon: string; text: string }> = {
  green: { icon: "✓", text: "Good pickup" },
  yellow: { icon: "!", text: "Little to gain" },
  red: { icon: "✕", text: "Don't do it" },
};

/** A traffic-light verdict: icon and words, so it reads without color. */
function Verdict({
  level,
  icon,
  children,
}: {
  level: FairnessLevel | PickLevel;
  icon: string;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.verdict} ${styles[level]}`}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      {children}
    </span>
  );
}

/** Traffic-light fairness: icon, words and percentage, so it reads without color. */
export function FairnessBadge({ fairness, favors }: { fairness: number; favors: string | null }) {
  const level = fairnessLevel(fairness);
  const { icon, text } = LABELS[level];
  return (
    <Verdict level={level} icon={icon}>
      {text} · {Math.round(fairness * 100)}%
      {level !== "green" && favors && <span className={styles.favors}>favors {favors}</span>}
    </Verdict>
  );
}

/** Trade value on each side as one split bar, with both numbers below it. */
function ValueBar({
  left,
  right,
  leftLabel,
  rightLabel,
  verbs,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  /** What you do with each side, for screen readers ("send", "get"). */
  verbs: readonly [string, string];
}) {
  const total = left + right || 1;
  return (
    <>
      <div
        className={styles.bar}
        role="img"
        aria-label={`Trade value: you ${verbs[0]} ${fmt(left)}, you ${verbs[1]} ${fmt(right)}`}
      >
        <span className={styles.give} style={{ flexGrow: Math.max(2, (left / total) * 100) }} />
        <span className={styles.get} style={{ flexGrow: Math.max(2, (right / total) * 100) }} />
      </div>
      <div className={styles.row} aria-hidden="true">
        <span>
          {leftLabel} <b>{fmt(left)}</b>
        </span>
        <span>
          {rightLabel} <b>{fmt(right)}</b>
        </span>
      </div>
    </>
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
  const favors = sGet > sGive ? "you" : sGive > sGet ? "them" : null;
  return (
    <div className={styles.meter}>
      <FairnessBadge fairness={fairness} favors={favors} />
      <ValueBar
        left={sGive}
        right={sGet}
        leftLabel="Value you send"
        rightLabel="Value you get"
        verbs={["send", "get"]}
      />
    </div>
  );
}

/** Trade value dropped versus added, with the pickup verdict and the value gained. */
export function PickMeter({
  sDrop,
  sAdd,
  level,
}: {
  sDrop: number;
  sAdd: number;
  level: PickLevel;
}) {
  const { icon, text } = PICK_LABELS[level];
  return (
    <div className={styles.meter}>
      <Verdict level={level} icon={icon}>
        {text} · {signed(sAdd - sDrop)} trade value
      </Verdict>
      <ValueBar
        left={sDrop}
        right={sAdd}
        leftLabel="Value you drop"
        rightLabel="Value you add"
        verbs={["drop", "add"]}
      />
    </div>
  );
}
