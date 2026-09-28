import { fmt, signed, trend } from "@/lib/format";
import type { Player } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import styles from "./Player.module.css";

const KNOWN_POSITIONS = new Set(NFL.positions);

export function PosBadge({ pos }: { pos: string }) {
  const cls = KNOWN_POSITIONS.has(pos) ? styles[pos as keyof typeof styles] : undefined;
  return <span className={`${styles.pos} ${cls ?? ""}`}>{pos}</span>;
}

export function InjuryBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const rule = NFL.model.injury[status];
  const serious = (rule && !rule.startable) || status === "Out";
  return (
    <span className={`${styles.injury} ${serious ? "" : styles.injurySoft}`} title="Injury status">
      {status}
    </span>
  );
}

export function PlayerCell({ player }: { player: Player }) {
  return (
    <div>
      <div className={styles.name}>
        {player.name}
        <InjuryBadge status={player.inj} />
      </div>
      <div className={styles.sub}>
        <PosBadge pos={player.pos} />
        <span>{player.team || "No team"}</span>
      </div>
    </div>
  );
}

/** A change shown with sign, arrow and color, so it reads without color too. */
export function Delta({ value, digits = 1 }: { value: number; digits?: number }) {
  const t = trend(value);
  return (
    <span className={`${styles.delta} ${t === "up" ? "up" : t === "down" ? "down" : ""}`}>
      {t !== "flat" && (
        <span className={styles.arrow} aria-hidden="true">
          {t === "up" ? "▲" : "▼"}
        </span>
      )}
      {signed(value, digits)}
    </span>
  );
}

/** Recent form, highlighted when it differs from last season by more than 1 pt/game. */
export function FormValue({ player }: { player: Player }) {
  if (player.lastAvg === null) return <span className="muted">–</span>;
  const d = player.prevPpg !== null ? player.lastAvg - player.prevPpg : 0;
  const t = trend(d, 1);
  return (
    <span className={t === "up" ? "up" : t === "down" ? "down" : undefined}>
      {t !== "flat" && (
        <span className={styles.arrow} aria-hidden="true">
          {t === "up" ? "▲" : "▼"}
        </span>
      )}
      {fmt(player.lastAvg)}
      {t !== "flat" && (
        <span className="visually-hidden">
          {t === "up" ? ", up from last season" : ", down from last season"}
        </span>
      )}
    </span>
  );
}

/** Weekly points as small bars on a shared scale; a dot marks weeks without a game. */
export function Sparkline({ player, max }: { player: Player; max: number }) {
  const barWidth = 7;
  const gap = 3;
  const height = 24;
  const n = player.weekly.length;
  if (!n) return null;
  const width = n * (barWidth + gap) - gap;
  const label = player.weekly
    .map((w) => `week ${w.week}: ${w.pts === null ? "did not play" : `${fmt(w.pts)} points`}`)
    .join(", ");
  return (
    <svg
      className={styles.spark}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Points by week for ${player.name}: ${label}`}
    >
      {player.weekly.map((w, i) => {
        const x = i * (barWidth + gap);
        if (w.pts === null) {
          return (
            <rect
              key={w.week}
              x={x + barWidth / 2 - 1.5}
              y={height - 3}
              width={3}
              height={3}
              rx={1.5}
              className={styles.miss}
            />
          );
        }
        const h = Math.max(2, (Math.max(0, w.pts) / max) * height);
        return (
          <rect
            key={w.week}
            x={x}
            y={height - h}
            width={barWidth}
            height={h}
            rx={1.5}
            className={styles.hit}
          >
            <title>{`Week ${w.week}: ${fmt(w.pts)} pts`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
