import { Fragment, useMemo } from "react";
import { fmt } from "@/lib/format";
import type { Team } from "@/lib/league";
import { needsMap, ordinal, rosterPlayers, type Model, type NeedsCell } from "@/lib/model";
import { MatchupTone } from "./MatchupBadge";
import { useSport } from "./SportContext";
import styles from "./TeamTable.module.css";

/** Strong to weak, for screen readers: the colors alone do not say it. */
const WORDS = {
  great: "among the strongest",
  good: "strong",
  neutral: "middle",
  tough: "weak",
  brutal: "among the weakest",
} as const;

function Cell({
  cell,
  teams,
  note,
  missing,
  start,
}: {
  /** Null when the team has nobody there (no bench at the position): a dash. */
  cell: NeedsCell | null;
  teams: number;
  note: string;
  /** The tooltip of the dash. */
  missing?: string;
  /** The first column of a position: a divider on its left. */
  start?: boolean;
}) {
  const cls = `num ${start ? styles.start : ""}`;
  if (!cell) {
    return (
      <td className={cls}>
        <span className="muted" title={missing}>
          –
        </span>
      </td>
    );
  }
  return (
    <td className={cls}>
      <MatchupTone
        level={cell.level}
        word={WORDS[cell.level]}
        title={`${ordinal(cell.rank)} of ${teams}: ${note} ${fmt(cell.ppg)} pts/g`}
      >
        {ordinal(cell.rank)}
      </MatchupTone>
    </td>
  );
}

/**
 * Where every team stands at each position and with its whole lineup: green
 * where it is among the league's strongest, red where it needs help. Teams
 * go from the strongest roster to the weakest; yours is highlighted.
 */
export function NeedsMap({ model, teams, myRid }: { model: Model; teams: Team[]; myRid: number }) {
  const sport = useSport();
  const map = useMemo(
    () =>
      needsMap(
        teams.map((t) => ({
          rid: t.rid,
          players: rosterPlayers(model, t.playerIds, t.reserveIds),
        })),
        model,
        sport,
      ),
    [model, teams, sport],
  );
  const name = (rid: number) => teams.find((t) => t.rid === rid)?.name ?? `Team ${rid}`;

  return (
    <div className="table-wrap">
      <table className={`table ${styles.table}`}>
        <caption className="visually-hidden">
          Each team&apos;s rank among the league&apos;s {map.teams} teams with its whole roster, its
          starting lineup and at each position, strongest roster first; 1st is the strongest
        </caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2}>
              Team
            </th>
            <th
              scope="col"
              rowSpan={2}
              className="num"
              title="The whole roster: the best lineup's points per game plus bench depth (20% of what the best backup at each position scores above a free agent)"
            >
              Roster
            </th>
            <th
              scope="col"
              rowSpan={2}
              className="num"
              title="The best starting lineup's points per game"
            >
              Lineup
            </th>
            {map.positions.map((pos) => (
              <th
                key={pos}
                scope="colgroup"
                colSpan={2}
                className={`${styles.group} ${styles.start}`}
              >
                {pos}
              </th>
            ))}
          </tr>
          <tr>
            {map.positions.map((pos) => (
              <Fragment key={pos}>
                <th
                  scope="col"
                  className={`num ${styles.start}`}
                  title={`The ${pos}s the lineup starts (its best ${pos}s), by points per game`}
                >
                  Start
                </th>
                <th
                  scope="col"
                  className="num"
                  title={`The next ${pos}s on the roster, by points per game`}
                >
                  Bench
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.rows.map((row) => (
            <tr key={row.rid} className={row.rid === myRid ? styles.mine : undefined}>
              <th scope="row" className={styles.team}>
                {row.rid === myRid ? "You" : name(row.rid)}
              </th>
              <Cell cell={row.roster} teams={map.teams} note="lineup plus bench depth:" />
              <Cell cell={row.lineup} teams={map.teams} note="best lineup scores" />
              {map.positions.map((pos) => (
                <Fragment key={pos}>
                  <Cell
                    cell={row.cells[pos]!.starters}
                    teams={map.teams}
                    note={`${pos} starters average`}
                    start
                  />
                  <Cell
                    cell={row.cells[pos]!.bench}
                    teams={map.teams}
                    note={`${pos} bench averages`}
                    missing={`No ${pos} on the bench`}
                  />
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
