"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  defenseFactors,
  seasonRanks,
  statBenchmarks,
  type Model,
  type Player,
  type StatsFile,
} from "@/lib/model";
import type { SportConfig } from "@/lib/sports/types";
import { Modal } from "./Modal";
import styles from "./PlayerCard.module.css";
import { PlayerCardPanel } from "./PlayerCardPanel";

interface CardState {
  enabled: boolean;
  open: (id: string) => void;
}

const TITLE_ID = "player-card-title";

const PlayerCardContext = createContext<CardState>({ enabled: false, open: () => {} });

/** Holds the one player card dialog every player name opens. */
export function PlayerCardProvider({
  model,
  stats,
  sport,
  children,
}: {
  model: Model;
  stats: StatsFile;
  sport: SportConfig;
  children: ReactNode;
}) {
  // What each defense allows to each position, the same measure as the weekly lineup's.
  const factors = useMemo(
    () => defenseFactors(model, stats, sport.model.matchupShrinkGames),
    [model, stats, sport],
  );
  // What rosterable players at each position do per game: the reference for each cell's color.
  const benchmarks = useMemo(() => statBenchmarks(model, stats, sport), [model, stats, sport]);
  // Every player's rank by season fantasy points, at his position and overall.
  const ranks = useMemo(() => seasonRanks(model), [model]);
  const [target, setTarget] = useState<{ id: string; at: number } | null>(null);
  const player = target ? model.players[target.id] : undefined;

  return (
    <PlayerCardContext.Provider
      value={{ enabled: true, open: (id) => setTarget({ id, at: Date.now() }) }}
    >
      {children}
      <Modal
        open={Boolean(target && player)}
        labelledBy={TITLE_ID}
        size="wide"
        onClose={() => setTarget(null)}
      >
        {target && player && (
          <PlayerCardPanel
            key={`${target.id}-${target.at}`}
            titleId={TITLE_ID}
            player={player}
            stats={stats}
            factors={factors}
            benchmarks={benchmarks}
            rank={ranks.get(player.id)}
            sport={sport}
          />
        )}
      </Modal>
    </PlayerCardContext.Provider>
  );
}

/**
 * A player's name that opens his player card. Plain text where a click
 * already means something else (a name in the analyzer's pick lists).
 */
export function PlayerName({ player, link = true }: { player: Player; link?: boolean }) {
  const { enabled, open } = useContext(PlayerCardContext);
  if (!enabled || !link) return <>{player.name}</>;
  return (
    <button
      type="button"
      className={styles.name}
      aria-haspopup="dialog"
      title={`Stats and schedule for ${player.name}`}
      onClick={() => open(player.id)}
    >
      {player.name}
    </button>
  );
}
