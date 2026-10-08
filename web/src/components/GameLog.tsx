import { fmt } from "@/lib/format";
import {
  matchupNote,
  PTS_KEY,
  statLevel,
  type CardGame,
  type Player,
  type PlayerCard,
  type StatLevel,
} from "@/lib/model";
import type { SportConfig } from "@/lib/sports/types";
import styles from "./GameLog.module.css";
import { MatchupBadge } from "./MatchupBadge";

/** Good, neutral or tough (as in the weekly lineup); the number in the tooltip. */
function Matchup({ game, pos }: { game: CardGame; pos: string }) {
  if (game.level === null || game.factor === null || !game.opponent) {
    return <span className="muted">–</span>;
  }
  return <MatchupBadge level={game.level} title={matchupNote(game.opponent, game.factor, pos)} />;
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
}: {
  player: Player;
  card: PlayerCard;
  /** The position's per-game averages (statBenchmarks), for each cell's color. */
  average: Readonly<Record<string, number>>;
  sport: SportConfig;
}) {
  const groups = sport.gameLog[player.pos] ?? [];
  const columns = groups.flatMap((g) => g.columns);
  // The first group is the position's main role (a receiver's receiving).
  const primary = new Set(groups[0]?.columns.map((c) => c.key));
  // Each group's first column carries the divider that sets the groups apart.
  const starts = new Set(groups.map((g) => g.columns[0]?.key));
  const rows = [...card.games, ...card.upcoming];
  const toCome = new Set(card.upcoming);

  return (
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
  );
}
