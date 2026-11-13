import { fmt, shortDate } from "@/lib/format";
import {
  cardColumns,
  columnValue,
  matchupNote,
  PTS_KEY,
  statLevel,
  type CardGame,
  type Player,
  type PlayerCard,
  type StatLevel,
} from "@/lib/model";
import type { SportConfig, StatColumn } from "@/lib/sports/types";
import styles from "./GameLog.module.css";
import { MatchupBadge } from "./MatchupBadge";

/** Good, neutral or tough (as in the weekly lineup); the number in the tooltip. */
function Matchup({ game, pos }: { game: CardGame; pos: string }) {
  if (!game.rating || !game.opponent) return <span className="muted">–</span>;
  return (
    <MatchupBadge level={game.rating.level} title={matchupNote(game.opponent, game.rating, pos)} />
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
  averageText = fmt,
  what,
  lowerIsBetter,
  sideRole,
  bold,
  start,
}: {
  value: number;
  text: string;
  average: number | undefined;
  /** How the average reads in the tooltip (a share as a percentage). */
  averageText?: (x: number) => string;
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
        average === undefined
          ? undefined
          : `The position averages ${averageText(average)} ${what} a game`
      }
    >
      {text}
      {level && <span className="visually-hidden">, {STAT_WORDS[level]}</span>}
    </td>
  );
}

/** "Oct 20" for a game day's date. */
const dateLabel = (iso: string | null) => (iso ? shortDate(iso) : "–");

/** Stats are counts (yards, catches): whole numbers, a decimal only when the source has one. */
const count = (x: number | undefined) =>
  x === undefined ? "0" : Number.isInteger(x) ? String(x) : fmt(x);

/** A column's number as shown: a share as a percentage, minutes whole, counts as they come. */
function cellText(c: StatColumn, x: number | undefined): string {
  if (c.per) return x === undefined ? "–" : `${Math.round(x * 100)}%`;
  if (c.whole) return String(Math.round(x ?? 0));
  return count(x);
}

/** What the tooltip's average speaks of: "38% share of the team's offensive snaps". */
const averageText = (c: StatColumn, average: number) =>
  c.per ? `${Math.round(average * 100)}%` : fmt(average);

/**
 * The player's season in one table, week by week: opponent, matchup, fantasy
 * points and the position's stat groups. Weeks still to play keep their stat
 * cells empty; a total row closes it.
 */
export function GameLog({
  player,
  card,
  average,
  sport,
  days,
}: {
  player: Player;
  card: PlayerCard;
  /** The position's per-game averages (statBenchmarks), for each cell's color. */
  average: Readonly<Record<string, number>>;
  sport: SportConfig;
  /**
   * For files kept by game day (the NBA): each game day's date and the fantasy week it
   * counts in. Rows show only the week otherwise.
   */
  days?: { date: (period: number) => string | null; week: (period: number) => number };
}) {
  const groups = sport.gameLog[player.pos] ?? [];
  // Playing time (when the position has a game log) comes first, then the groups.
  const columns = cardColumns(player.pos, sport);
  const time = groups.length ? sport.playingTime : undefined;
  // The first group is the position's main role (a receiver's receiving).
  const primary = new Set(groups[0]?.columns.map((c) => c.key));
  // Each group's first column carries the divider that sets the groups apart.
  const starts = new Set(groups.map((g) => g.columns[0]?.key));
  if (time) starts.add(time.key);
  const rows = [...card.games, ...card.upcoming];
  const toCome = new Set(card.upcoming);
  // Columns before the fantasy points: the date and its week on game days, the week otherwise.
  const lead = days ? 2 : 1;

  return (
    <div className="table-wrap">
      <table className={`table ${styles.log}`}>
        <caption className="visually-hidden">
          {player.name}&apos;s season{" "}
          {days ? "game by game, with the fantasy week" : "week by week"}: opponent, matchup,
          fantasy points and stats; games still to play show the opponent and matchup only
        </caption>
        <thead>
          {groups.length > 0 && (
            <tr>
              <td colSpan={lead + 3 + (time ? 1 : 0)} />
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
            {days && <th scope="col">Date</th>}
            <th scope="col" className="num" title="Fantasy week">
              Wk
            </th>
            <th scope="col">Opp</th>
            <th scope="col">Matchup</th>
            <th scope="col" className="num" title="Fantasy points, your league's scoring">
              {/* "Pts" is also a basketball stat: there the column says fantasy points. */}
              {columns.some((c) => c.key === "pts") ? "FPts" : "Pts"}
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`num ${starts.has(c.key) ? styles.start : ""}`}
                title={c.title}
              >
                <span aria-hidden="true">{c.label}</span>
                <span className="visually-hidden">{c.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.week}>
              {days && <td className={styles.date}>{dateLabel(days.date(g.week))}</td>}
              <td className="num">{days ? days.week(g.week) || "–" : g.week}</td>
              <td>
                <Opponent game={g} />
              </td>
              <td>
                <Matchup game={g} pos={player.pos} />
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
                  {columns.map((c) => {
                    const value = columnValue(c, g.stats);
                    return (
                      <StatCell
                        key={c.key}
                        value={value ?? 0}
                        text={cellText(c, value)}
                        // A share without its base (no snap counts) is left uncolored.
                        average={c.per && value === undefined ? undefined : columnValue(c, average)}
                        averageText={(x) => averageText(c, x)}
                        what={c.per ? c.title.replace(/^Share /, "") : c.title.toLowerCase()}
                        lowerIsBetter={c.lowerIsBetter}
                        sideRole={c !== time && !primary.has(c.key)}
                        start={starts.has(c.key)}
                      />
                    );
                  })}
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
            <th scope="row" colSpan={lead + 2}>
              Total
            </th>
            <td className={`num ${styles.pts}`}>{fmt(card.pts)}</td>
            {columns.map((c) => (
              <td key={c.key} className={`num ${starts.has(c.key) ? styles.start : ""}`}>
                {cellText(c, columnValue(c, card.totals))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
