import type { MatchupLevel } from "@/lib/model";
import styles from "./MatchupBadge.module.css";

const LEVELS: Record<MatchupLevel, { label: string; icon: string }> = {
  good: { label: "Good", icon: "▲" },
  neutral: { label: "Neutral", icon: "●" },
  tough: { label: "Tough", icon: "▼" },
};

/** Good, neutral or tough: icon and word, so it reads without color. */
export function MatchupBadge({ level, title }: { level: MatchupLevel; title?: string }) {
  const { label, icon } = LEVELS[level];
  return (
    <span className={`${styles.badge} ${styles[level]}`} title={title}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}
