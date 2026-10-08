import { fmt, signed, trend } from "@/lib/format";
import type { Player, PlayerScore } from "@/lib/model";
import { playablePositions } from "@/lib/sports";
import type { SportConfig } from "@/lib/sports/types";
import { NewsButton } from "./News";
import { PlayerName } from "./PlayerCard";
import styles from "./Player.module.css";
import { usePlayerScore } from "./ScoreContext";
import { useSport } from "./SportContext";

/** What "trade value" means in a sport, for tooltips and captions: the measures it weighs. */
export function tradeValueHint(sport: SportConfig): string {
  const { weights, reputationMaxAdp } = sport.tradeValue;
  const parts = [
    "expected points",
    "positional scarcity",
    ...(weights.usage > 0 ? [`${sport.id.toUpperCase()} usage`] : []),
    "this season",
    "draft market",
    `last ${sport.model.recentGames} games`,
    "proven base",
  ];
  const list = `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  const lift =
    reputationMaxAdp > 0 ? "; stars off to a slow start keep part of their draft rank's value" : "";
  return `Trade value, 1 to 40: ${list}${lift}.`;
}

/** What "trade value" means in the league's sport. */
export function useTradeValueHint(): string {
  return tradeValueHint(useSport());
}

const partLabels = (recent: number): Record<keyof PlayerScore["parts"], string> => ({
  base: "base",
  market: "market",
  expected: "expected",
  season: "season",
  recent: `last ${recent}`,
  scarcity: "scarcity",
  usage: "usage",
});

/** Trade value (1-40, one decimal) with its parts in the tooltip; value above replacement until scores load. */
export function TradeValue({ player }: { player: Player }) {
  const s = usePlayerScore(player.id);
  const sport = useSport();
  if (!s) return <>{fmt(player.vorp)}</>;
  const labels = partLabels(sport.model.recentGames);
  const parts = (Object.keys(labels) as (keyof PlayerScore["parts"])[])
    .filter((k) => k !== "usage" || sport.tradeValue.weights.usage > 0)
    .map((k) => `${labels[k]} ${Math.round(s.parts[k] * 100)}`)
    .join(", ");
  const extra =
    (s.availability < 1 ? `, availability ${Math.round(s.availability * 100)}%` : "") +
    (s.reputation > 0 ? `, reputation +${Math.round(s.reputation * 100)}%` : "");
  return <span title={`Trade value ${fmt(s.trade)}: ${parts}${extra}`}>{fmt(s.trade)}</span>;
}

export function PosBadge({ pos }: { pos: string }) {
  const known = useSport().positions.includes(pos);
  const cls = known ? styles[pos as keyof typeof styles] : undefined;
  return <span className={`${styles.pos} ${cls ?? ""}`}>{pos}</span>;
}

/** Short labels, so long statuses stay on the name's line. */
const INJURY_LABELS: Record<string, string> = { Questionable: "QUEST", Doubtful: "DOUBT" };

export function InjuryBadge({ status }: { status: string | null }) {
  const sport = useSport();
  if (!status) return null;
  const rule = sport.model.injury[status];
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

/** Every position he can play (eligibility), in the sport's order, the primary one first when tied. */
export function PosBadges({ player }: { player: Pick<Player, "pos" | "elig"> }) {
  const positions = playablePositions(player, useSport());
  return (
    <>
      {positions.map((pos) => (
        <PosBadge key={pos} pos={pos} />
      ))}
    </>
  );
}

export function PlayerCell({
  player,
  link = true,
}: {
  player: Player;
  /** The name opens the player card (off where a click picks the player). */
  link?: boolean;
}) {
  return (
    <div>
      <div className={styles.name}>
        <PlayerName player={player} link={link} />
        {/* A word joiner keeps the badges on the name's last line. */}
        {"\u2060"}
        <span className={styles.nowrap}>
          <InjuryBadge status={player.inj} />
          <NewsButton id={player.id} name={player.name} pos={player.pos} />
        </span>
      </div>
      <div className={styles.sub}>
        <PosBadges player={player} />
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
