import type { ReactNode } from "react";
import type { MatchupLevel } from "@/lib/model";
import styles from "./MatchupBadge.module.css";

const LEVELS: Record<MatchupLevel, { label: string; icon: string }> = {
  great: { label: "Great", icon: "▲▲" },
  good: { label: "Good", icon: "▲" },
  neutral: { label: "Neutral", icon: "●" },
  tough: { label: "Tough", icon: "▼" },
  brutal: { label: "Brutal", icon: "▼▼" },
};

/** The word for a level, as the badge shows it. */
export const matchupLabel = (level: MatchupLevel) => LEVELS[level].label;

/**
 * Great to brutal: icon and word, so it reads without color.
 * `compact` shows the icon only (the word stays for screen readers), for
 * several games in a row.
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
    <span className={`${styles.badge} ${styles[level]}`} title={title}>
      <span aria-hidden="true">{icon}</span>{" "}
      <span className={compact ? "visually-hidden" : undefined}>{label}</span>
    </span>
  );
}

/**
 * Any content (a schedule's rank) in a level's colors, the same as the
 * badge's. The level's word goes to screen readers, so color is not the only signal.
 */
export function MatchupTone({
  level,
  title,
  children,
}: {
  level: MatchupLevel;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className={`${styles.badge} ${styles[level]}`} title={title}>
      {children}
      <span className="visually-hidden"> ({LEVELS[level].label})</span>
    </span>
  );
}
