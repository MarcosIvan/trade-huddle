import type { MatchupLevel } from "@/lib/model";
import styles from "./MatchupBadge.module.css";

const LEVELS: Record<MatchupLevel, { label: string; icon: string }> = {
  good: { label: "Good", icon: "▲" },
  neutral: { label: "Neutral", icon: "●" },
  tough: { label: "Tough", icon: "▼" },
};

/**
 * Good, neutral or tough: icon and word, so it reads without color. `compact`
 * shows the icon only (the word stays for screen readers), for several games in a row.
 */
export function MatchupBadge({
  level,
  title,
  compact = false,
}: {
  level: MatchupLevel;
  title?: string;
  compact?: boolean;
}) {
  const { label, icon } = LEVELS[level];
  return (
    <span
      className={`${styles.badge} ${styles[level]} ${compact ? styles.compact : ""}`}
      title={title}
    >
      <span aria-hidden="true">{icon}</span>{" "}
      <span className={compact ? "visually-hidden" : undefined}>{label}</span>
    </span>
  );
}
