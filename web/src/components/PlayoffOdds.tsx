import type { Team } from "@/lib/league";
import { oddsLevel, oddsText, projectedRecord, type PlayoffTable } from "@/lib/model";
import { MatchupTone } from "./MatchupBadge";
import styles from "./TeamTable.module.css";

const record = (w: number, l: number, t = 0) => `${w}-${l}${t ? `-${t}` : ""}`;

function Odds({ p, what }: { p: number; what: string }) {
  return (
    <td className="num">
      <MatchupTone level={oddsLevel(p)} word={what} title={`${oddsText(p)} ${what}`}>
        {oddsText(p)}
      </MatchupTone>
    </td>
  );
}

/**
 * Every team's chances of making the playoffs (and of a first-round bye),
 * from the rest of the regular season simulated; best odds first, yours
 * highlighted.
 */
export function PlayoffOdds({
  table,
  teams,
  myRid,
}: {
  table: PlayoffTable;
  teams: Team[];
  myRid: number;
}) {
  const name = (rid: number) => teams.find((t) => t.rid === rid)?.name ?? `Team ${rid}`;
  return (
    <div className="table-wrap">
      <table className={`table ${styles.table}`}>
        <caption className="visually-hidden">
          Each team&apos;s record, projected record and chances of making the playoffs
          {table.byes > 0 ? " and of a first-round bye" : ""}, with {table.weeksLeft} regular season
          weeks left, best chances first
        </caption>
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col" className="num" title="Wins and losses so far">
              Record
            </th>
            <th
              scope="col"
              className="num"
              title={`Wins and losses expected after the ${table.weeksLeft} weeks left`}
            >
              Projected
            </th>
            <th scope="col" className="num" title="Chances of making the playoffs">
              Playoffs
            </th>
            {table.byes > 0 && (
              <th
                scope="col"
                className="num"
                title={`Chances of a top ${table.byes} seed, which skips the first round`}
              >
                Bye
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.rid} className={r.rid === myRid ? styles.mine : undefined}>
              <th scope="row" className={styles.team}>
                {r.rid === myRid ? "You" : name(r.rid)}
              </th>
              <td className="num">{record(r.wins, r.losses, r.ties)}</td>
              <td className="num">{projectedRecord(r.projWins, r.projLosses)}</td>
              <Odds p={r.playoffs} what="to make the playoffs" />
              {table.byes > 0 && <Odds p={r.bye} what="to get a bye" />}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
