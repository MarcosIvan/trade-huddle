import { useContext, useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import {
  freeAgentRows,
  pageCount,
  pageOf,
  FREE_AGENT_PAGE,
  type FreeAgentData,
  type FreeAgentRow,
  type FreeAgentSort,
  type Model,
  type Player,
  type Scorer,
  type StatsFile,
} from "@/lib/model";
import { Pagination } from "./Pagination";
import { PlayerCell, TradeValue, useTradeValueHint } from "./Player";
import { ScoreContext } from "./ScoreContext";
import { Segmented } from "./Segmented";
import { useSport } from "./SportContext";
import styles from "./FreeAgentList.module.css";

const SORTS: { value: FreeAgentSort; label: string }[] = [
  { value: "value", label: "Trade value" },
  { value: "points", label: "Fantasy points" },
];

/** Stats are counts: whole numbers as they are, projections with one decimal. */
const count = (x: number | undefined) =>
  x === undefined ? "0" : Number.isInteger(x) ? String(x) : fmt(x);

/** The games ahead in the projections view: the opponent (one game) or how many games. */
function GamesAhead({ row, multi }: { row: FreeAgentRow; multi: boolean }) {
  if (multi) return <>{row.matchups.length}</>;
  const game = row.matchups[0];
  if (!game) return <span className="muted">Bye</span>;
  return (
    <>
      {game.home ? "vs" : "@"} {game.opponent}
    </>
  );
}

/**
 * The league's free agents at a position, a page at a time, with this
 * season's stats or the projection for the week ahead (as in Sleeper's
 * player list), ranked by trade value or fantasy points.
 */
export function FreeAgentList({
  model,
  stats,
  score,
  rostered,
  onAnalyze,
}: {
  model: Model;
  stats: StatsFile;
  /** Fantasy points under the league's scoring. */
  score: Scorer;
  /** Players on a roster in the league. */
  rostered: ReadonlySet<string>;
  /** Opens the player in the pick analyzer. */
  onAnalyze: (player: Player) => void;
}) {
  const sport = useSport();
  const scores = useContext(ScoreContext);
  const valueHint = useTradeValueHint();
  const [chosenPos, setPos] = useState<string | null>(null);
  const [data, setData] = useState<FreeAgentData>("stats");
  const [by, setBy] = useState<FreeAgentSort>("value");
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const pos = chosenPos && sport.positions.includes(chosenPos) ? chosenPos : sport.positions[0]!;
  const week = stats.lineup_week ?? null;
  // No week left to project after the season.
  const view: FreeAgentData = week === null ? "stats" : data;
  const multi = Boolean(sport.multiGameWeeks);

  const rows = useMemo(
    () =>
      freeAgentRows(
        model,
        stats,
        score,
        rostered,
        pos,
        view,
        by,
        (p: Player) => scores.get(p.id)?.trade ?? p.vorp,
      ),
    [model, stats, score, rostered, pos, view, by, scores],
  );
  // A new position, view or order starts again at the first page.
  const key = `${sport.id}-${pos}-${view}-${by}`;
  const page = paging.key === key ? paging.page : 1;
  const pages = pageCount(rows.length);
  const shown = pageOf(rows, page);
  const first = (Math.min(page, pages) - 1) * FREE_AGENT_PAGE;

  const groups = sport.gameLog[pos] ?? [];
  const columns = groups.flatMap((g) => g.columns);
  const starts = new Set(groups.map((g) => g.columns[0]?.key));
  // "Pts" is also a basketball stat: there the column says fantasy points.
  const ptsLabel = columns.some((c) => c.key === "pts") ? "FPts" : "Pts";
  const projected = view === "projections";
  const lead = projected ? 5 : 6;
  const dataOptions: { value: FreeAgentData; label: string }[] = [
    { value: "stats", label: "Season stats" },
    ...(week === null
      ? []
      : [{ value: "projections" as const, label: `Week ${week} projections` }]),
  ];

  return (
    <div className={styles.list}>
      <div className={styles.controls}>
        <Segmented
          legend="Position"
          options={sport.positions.map((p) => ({ value: p, label: p }))}
          value={pos}
          onChange={setPos}
        />
        <Segmented legend="Show" options={dataOptions} value={view} onChange={setData} />
        <Segmented legend="Rank by" options={SORTS} value={by} onChange={setBy} />
      </div>
      {rows.length === 0 ? (
        <p className="hint">No {pos} free agents in this league.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className={`table ${styles.table}`}>
              <caption className="visually-hidden">
                {pos} free agents with{" "}
                {projected ? `their week ${week} projection` : "their season stats"}, by{" "}
                {by === "value" ? "trade value" : "fantasy points"}; page {page} of {pages}
              </caption>
              <thead>
                {groups.length > 0 && (
                  <tr>
                    <td colSpan={lead} />
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
                    <td />
                  </tr>
                )}
                <tr>
                  <th scope="col" className="num">
                    #
                  </th>
                  <th scope="col">Player</th>
                  <th
                    scope="col"
                    className={`num ${by === "value" ? styles.sorted : ""}`}
                    title={valueHint}
                  >
                    Trade value
                  </th>
                  {projected ? (
                    <th scope="col" title={multi ? "Games left this week" : "This week's opponent"}>
                      {multi ? "Games" : "Opp"}
                    </th>
                  ) : (
                    <th scope="col" className="num" title="Games played this season">
                      GP
                    </th>
                  )}
                  <th
                    scope="col"
                    className={`num ${by === "points" ? styles.sorted : ""}`}
                    title={
                      projected
                        ? "Projected fantasy points this week, your league's scoring"
                        : "Fantasy points this season, your league's scoring"
                    }
                  >
                    {ptsLabel}
                  </th>
                  {!projected && (
                    <th scope="col" className="num" title="Fantasy points per game played">
                      Pts/g
                    </th>
                  )}
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
                  <th scope="col">
                    <span className="visually-hidden">Analyze</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.player.id}>
                    <td className="num">{first + i + 1}</td>
                    <td>
                      <PlayerCell player={r.player} />
                    </td>
                    <td className={`num ${by === "value" ? styles.sorted : ""}`}>
                      <TradeValue player={r.player} />
                    </td>
                    {projected ? (
                      <td className={multi ? "num" : styles.opp}>
                        <GamesAhead row={r} multi={multi} />
                      </td>
                    ) : (
                      <td className="num">{r.games}</td>
                    )}
                    <td className={`num ${by === "points" ? styles.sorted : ""}`}>
                      {fmt(r.games ? r.points : null)}
                    </td>
                    {!projected && <td className="num">{fmt(r.ppg)}</td>}
                    {columns.map((c) => (
                      <td key={c.key} className={`num ${starts.has(c.key) ? styles.start : ""}`}>
                        {r.games ? count(r.stats[c.key]) : <span className="muted">–</span>}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className={`btn ${styles.analyze}`}
                        onClick={() => onAnalyze(r.player)}
                        aria-label={`Analyze adding ${r.player.name}`}
                      >
                        Analyze
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            label="Free agents"
            page={Math.min(page, pages)}
            pages={pages}
            onPage={(n) => setPaging({ key, page: n })}
          />
        </>
      )}
    </div>
  );
}
