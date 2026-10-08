"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fmt } from "@/lib/format";
import {
  defenseFactors,
  playerCard,
  PTS_KEY,
  seasonRanks,
  statBenchmarks,
  statLevel,
  type CardGame,
  type DefenseFactors,
  type MatchupLevel,
  type Model,
  type Player,
  type SeasonRank,
  type StatBenchmarks,
  type StatLevel,
  type StatsFile,
} from "@/lib/model";
import type { SportConfig } from "@/lib/sports/types";
import styles from "./PlayerCard.module.css";

interface CardState {
  enabled: boolean;
  open: (id: string) => void;
}

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
  const dialog = useRef<HTMLDialogElement>(null);
  const player = target ? model.players[target.id] : undefined;

  useEffect(() => {
    if (target && !dialog.current?.open) dialog.current?.showModal();
  }, [target]);

  return (
    <PlayerCardContext.Provider
      value={{ enabled: true, open: (id) => setTarget({ id, at: Date.now() }) }}
    >
      {children}
      <dialog
        ref={dialog}
        className={styles.dialog}
        aria-labelledby="player-card-title"
        onClose={() => setTarget(null)}
        onClick={(e) => {
          // A click on the backdrop (outside the panel) closes it.
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        {target && player && (
          <CardPanel
            key={`${target.id}-${target.at}`}
            player={player}
            stats={stats}
            factors={factors}
            benchmarks={benchmarks}
            rank={ranks.get(player.id)}
            sport={sport}
            onClose={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </PlayerCardContext.Provider>
  );
}

const LEVELS: Record<MatchupLevel, { label: string; icon: string }> = {
  good: { label: "Good", icon: "▲" },
  neutral: { label: "Neutral", icon: "●" },
  tough: { label: "Tough", icon: "▼" },
};

/** Good, neutral or tough (as in the weekly lineup): icon and word, so it reads without color; the number in the tooltip. */
function MatchupBadge({ game, pos }: { game: CardGame; pos: string }) {
  if (game.level === null || game.factor === null || !game.opponent) {
    return <span className="muted">–</span>;
  }
  const { label, icon } = LEVELS[game.level];
  const diff = game.factor - 1;
  const title =
    game.level === "neutral"
      ? `${game.opponent} allows about the average to ${pos}s`
      : `${game.opponent} allows ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "more" : "fewer"} points than average to ${pos}s`;
  return (
    <span className={`${styles.badge} ${styles[game.level]}`} title={title}>
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}

function Opponent({ game }: { game: CardGame }) {
  if (game.bye) return <span className="muted">Bye</span>;
  if (!game.opponent) return <span className="muted">–</span>;
  return (
    <span className={styles.opp}>
      {game.home ? "vs" : "@"} {game.opponent}
    </span>
  );
}

const STAT_WORDS: Record<StatLevel, string> = { good: "good", neutral: "average", bad: "poor" };

/**
 * One game's number, colored against what rosterable players at the position do per
 * game: green good, yellow average, light red poor (the word is there for
 * screen readers, the average in the tooltip).
 */
function StatCell({
  value,
  text,
  average,
  what,
  lowerIsBetter,
  sideRole,
  bold,
  start,
}: {
  value: number;
  text: string;
  average: number | undefined;
  what: string;
  lowerIsBetter?: boolean;
  /** A stat of the position's second group (a receiver's rushing): a zero is no failure. */
  sideRole?: boolean;
  bold?: boolean;
  /** The first column of a stat group: a divider on its left. */
  start?: boolean;
}) {
  const level = average === undefined ? null : statLevel(value, average, lowerIsBetter, sideRole);
  const cls = `num ${styles.cell} ${level ? styles[`cell_${level}`] : styles.empty} ${bold ? styles.pts : ""} ${start ? styles.start : ""}`;
  return (
    <td
      className={cls}
      title={
        average === undefined ? undefined : `The position averages ${fmt(average)} ${what} a game`
      }
    >
      {text}
      {level && <span className="visually-hidden">, {STAT_WORDS[level]}</span>}
    </td>
  );
}

/** Stats are counts (yards, catches): whole numbers, a decimal only when the source has one. */
const count = (x: number | undefined) =>
  x === undefined ? "0" : Number.isInteger(x) ? String(x) : fmt(x);

function CardPanel({
  player,
  stats,
  factors,
  benchmarks,
  rank,
  sport,
  onClose,
}: {
  player: Player;
  stats: StatsFile;
  factors: DefenseFactors;
  benchmarks: StatBenchmarks;
  /** Undefined when he has not played this season. */
  rank: SeasonRank | undefined;
  sport: SportConfig;
  onClose: () => void;
}) {
  const card = useMemo(
    () => playerCard(player, stats, factors, sport),
    [player, stats, factors, sport],
  );
  const groups = sport.gameLog[player.pos] ?? [];
  const columns = groups.flatMap((g) => g.columns);
  // The first group is the position's main role (a receiver's receiving).
  const primary = new Set(groups[0]?.columns.map((c) => c.key));
  // Each group's first column carries the divider that sets the groups apart.
  const starts = new Set(groups.map((g) => g.columns[0]?.key));
  // One table for the whole season: weeks still to play keep their stat cells empty.
  const rows = [...card.games, ...card.upcoming];
  const toCome = new Set(card.upcoming);
  const status = [player.team || "No team", player.inj].filter(Boolean).join(" · ");
  const average = benchmarks.get(player.pos) ?? {};

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <h2 id="player-card-title" className={styles.title}>
          <span className={styles.kicker}>
            {player.pos} · {status}
          </span>
          {player.name}
        </h2>
        <button
          type="button"
          className={`btn ${styles.close}`}
          aria-label="Close"
          autoFocus
          onClick={onClose}
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

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
      {rows.length ? (
        <div className="table-wrap">
          <table className={`table ${styles.log}`}>
            <caption className="visually-hidden">
              {player.name}&apos;s season week by week: opponent, matchup, fantasy points and stats;
              weeks still to play show the opponent and matchup only
            </caption>
            <thead>
              {groups.length > 0 && (
                <tr>
                  <td colSpan={4} />
                  {groups.map((g) => (
                    <th
                      key={g.label}
                      scope="colgroup"
                      colSpan={g.columns.length}
                      className={`${styles.group} ${styles.start}`}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
              )}
              <tr>
                <th scope="col" className="num">
                  Wk
                </th>
                <th scope="col">Opp</th>
                <th scope="col">Matchup</th>
                <th scope="col" className="num" title="Fantasy points, your league's scoring">
                  Pts
                </th>
                {groups.map((g) =>
                  g.columns.map((c) => (
                    <th
                      key={`${g.label}-${c.key}`}
                      scope="col"
                      className={`num ${starts.has(c.key) ? styles.start : ""}`}
                      title={c.title}
                    >
                      <span aria-hidden="true">{c.label}</span>
                      <span className="visually-hidden">{c.title}</span>
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.week}>
                  <td className="num">{g.week}</td>
                  <td>
                    <Opponent game={g} />
                  </td>
                  <td>
                    <MatchupBadge game={g} pos={player.pos} />
                  </td>
                  {g.pts !== null ? (
                    <>
                      <StatCell
                        value={g.pts}
                        text={fmt(g.pts)}
                        average={average[PTS_KEY]}
                        what="fantasy points"
                        bold
                      />
                      {columns.map((c) => (
                        <StatCell
                          key={c.key}
                          value={g.stats[c.key] ?? 0}
                          text={count(g.stats[c.key])}
                          average={average[c.key]}
                          what={c.title.toLowerCase()}
                          lowerIsBetter={c.lowerIsBetter}
                          sideRole={!primary.has(c.key)}
                          start={starts.has(c.key)}
                        />
                      ))}
                    </>
                  ) : !toCome.has(g) && !g.bye ? (
                    // A week gone by without him: said across the row, not left blank like a game to come.
                    <td colSpan={1 + columns.length} className={`${styles.cell} ${styles.dnp}`}>
                      Did not play
                    </td>
                  ) : (
                    [PTS_KEY, ...columns.map((c) => c.key)].map((k) => (
                      <td
                        key={k}
                        className={`num ${styles.cell} ${styles.empty} ${starts.has(k) ? styles.start : ""}`}
                      />
                    ))
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  Total
                </th>
                <td className={`num ${styles.pts}`}>{fmt(card.pts)}</td>
                {columns.map((c) => (
                  <td key={c.key} className={`num ${starts.has(c.key) ? styles.start : ""}`}>
                    {count(card.totals[c.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className={styles.status}>No games on the schedule yet.</p>
      )}
    </div>
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
