import { useMemo } from "react";
import { fmt } from "@/lib/format";
import {
  periodDate,
  playerCard,
  type DefenseFactors,
  type Player,
  type SeasonRank,
  type StatBenchmarks,
  type StatsFile,
} from "@/lib/model";
import { playablePositions } from "@/lib/sports";
import type { SportConfig } from "@/lib/sports/types";
import { GameLog } from "./GameLog";
import { ModalHeader } from "./Modal";
import styles from "./PlayerCardPanel.module.css";

/** What the player card shows: his season totals and rank, then his season week by week. */
export function PlayerCardPanel({
  titleId,
  player,
  stats,
  factors,
  benchmarks,
  rank,
  sport,
}: {
  titleId: string;
  player: Player;
  stats: StatsFile;
  factors: DefenseFactors;
  benchmarks: StatBenchmarks;
  /** Undefined when he has not played this season. */
  rank: SeasonRank | undefined;
  sport: SportConfig;
}) {
  const card = useMemo(
    () => playerCard(player, stats, factors, sport),
    [player, stats, factors, sport],
  );
  const status = [player.team || "No team", player.inj].filter(Boolean).join(" · ");

  return (
    <>
      <ModalHeader
        id={titleId}
        kicker={`${playablePositions(player, sport).join("/")} · ${status}`}
      >
        {player.name}
      </ModalHeader>

      <dl className={styles.summary}>
        <div>
          <dt>Fantasy pts</dt>
          <dd>{fmt(card.pts)}</dd>
        </div>
        <div>
          <dt>Pts/game</dt>
          <dd>{card.played ? fmt(card.pts / card.played) : "–"}</dd>
        </div>
        <div>
          <dt>Games</dt>
          <dd>{card.played}</dd>
        </div>
        <div title={`Rank by season fantasy points among every ${player.pos}`}>
          <dt>{player.pos} rank</dt>
          <dd>{rank ? `#${rank.pos}` : "–"}</dd>
        </div>
        <div title="Rank by season fantasy points among every player">
          <dt>Overall rank</dt>
          <dd>{rank ? `#${rank.overall}` : "–"}</dd>
        </div>
      </dl>

      <h3 className={styles.section}>{stats.season} season</h3>
      {card.games.length + card.upcoming.length ? (
        <GameLog
          player={player}
          card={card}
          average={benchmarks.get(player.pos) ?? {}}
          sport={sport}
          dateOf={stats.period === "day" ? (period) => periodDate(stats, period) : undefined}
        />
      ) : (
        <p className={styles.status}>No games on the schedule yet.</p>
      )}
    </>
  );
}
