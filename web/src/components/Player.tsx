import { fmt, signed, trend } from "@/lib/format";
import type { Player, PlayerScore } from "@/lib/model";
import { SCORE_WEIGHTS, TRADE_VALUE_MAX } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import { NewsButton } from "./News";
import styles from "./Player.module.css";
import { usePlayerScore } from "./ScoreContext";

const KNOWN_POSITIONS = new Set(NFL.positions);

/** What "trade value" means, for tooltips and captions. */
export const TRADE_VALUE_HINT =
  "Trade value, 1 to 40: expected points, positional scarcity, NFL usage, this season, draft market, last 3 games and proven base; stars off to a slow start keep part of their draft rank's value.";

const PART_LABELS: Record<keyof PlayerScore["parts"], string> = {
  base: "base",
  market: "market",
  expected: "expected",
  season: "season",
  recent: "last 3",
  scarcity: "scarcity",
  usage: "usage",
};

/** Trade value (1-40, one decimal) with its parts in the tooltip; value above replacement until scores load. */
export function TradeValue({ player }: { player: Player }) {
  const s = usePlayerScore(player.id);
  if (!s) return <>{fmt(player.vorp)}</>;
  const parts = (Object.keys(PART_LABELS) as (keyof PlayerScore["parts"])[])
    .map((k) => `${PART_LABELS[k]} ${Math.round(s.parts[k] * 100)}`)
    .join(", ");
  const extra =
    (s.availability < 1 ? `, availability ${Math.round(s.availability * 100)}%` : "") +
    (s.reputation > 0 ? `, reputation +${Math.round(s.reputation * 100)}%` : "");
  return <span title={`Trade value ${fmt(s.trade)}: ${parts}${extra}`}>{fmt(s.trade)}</span>;
}

export function PosBadge({ pos }: { pos: string }) {
  const cls = KNOWN_POSITIONS.has(pos) ? styles[pos as keyof typeof styles] : undefined;
  return <span className={`${styles.pos} ${cls ?? ""}`}>{pos}</span>;
}

/** Short labels, so long statuses stay on the name's line. */
const INJURY_LABELS: Record<string, string> = { Questionable: "QUEST", Doubtful: "DOUBT" };

export function InjuryBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const rule = NFL.model.injury[status];
  const serious = (rule && !rule.startable) || status === "Out";
  const label = INJURY_LABELS[status] ?? status.toUpperCase();
  return (
    <span
      className={`${styles.injury} ${serious ? "" : styles.injurySoft}`}
      title={`Injury status: ${status}`}
    >
      <span aria-hidden="true">{label}</span>
      <span className="visually-hidden">{status}</span>
    </span>
  );
}

/** Player Score (0-100) as a small pill; the tooltip explains the parts. */
export function ScorePill({ id }: { id: string }) {
  const s = usePlayerScore(id);
  if (!s) return null;
  const parts = [
    `trade value ${fmt(s.trade)} of ${TRADE_VALUE_MAX} → ${Math.round((SCORE_WEIGHTS.trade * s.trade) / TRADE_VALUE_MAX)}/${SCORE_WEIGHTS.trade}`,
    `team importance ${Math.round(s.importance * SCORE_WEIGHTS.importance)}/${SCORE_WEIGHTS.importance}`,
  ];
  if (s.usageRank) parts.push(`weapon #${s.usageRank} of his offense`);
  return (
    <span className={styles.score} title={`Player Score: ${parts.join(", ")}`}>
      <span className="visually-hidden">Player Score </span>
      {Math.round(s.total)}
    </span>
  );
}

export function PlayerCell({
  player,
  showScore = true,
}: {
  player: Player;
  /** The Player Score pill next to the name. */
  showScore?: boolean;
}) {
  const words = player.name.split(" ");
  const last = words.pop();
  const first = words.join(" ");
  return (
    <div>
      <div className={styles.name}>
        {first && `${first} `}
        {/* The badges stick to the last word, so they never drop to a line of their own. */}
        <span className={styles.nowrap}>
          {last}
          {showScore && <ScorePill id={player.id} />}
          <InjuryBadge status={player.inj} />
          <NewsButton id={player.id} name={player.name} pos={player.pos} />
        </span>
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
