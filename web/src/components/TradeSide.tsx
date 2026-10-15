import { useId } from "react";
import { fmt, pct } from "@/lib/format";
import {
  scheduleNote,
  type Player,
  type PlayerSchedule,
  type ScheduleStrength,
  type SideChange,
} from "@/lib/model";
import { Delta, FormValue, PlayerCell, TradeValue, useTradeValueHint } from "./Player";
import { useSport } from "./SportContext";
import styles from "./TradeSide.module.css";

const SCHEDULE_HINT =
  "what his opponents' defenses allowed to his position so far; green is easier, red harder. Rank among every team's schedule (1 = easiest). Information only: trade value and fairness ignore it.";

function ByeWeek({ schedule }: { schedule: PlayerSchedule | undefined }) {
  if (!schedule?.bye) return <span className="muted">–</span>;
  return schedule.byeDone ? (
    <span className="muted" title="Bye already played">
      {schedule.bye}
    </span>
  ) : (
    <>{schedule.bye}</>
  );
}

const LEVEL_CLASS = { good: "up", neutral: "muted", tough: "down" } as const;

/** His schedule's rank among every team's for his position, colored easy (green) to tough (red). */
function StrengthCell({
  strength,
  pos,
  stretch,
}: {
  strength: ScheduleStrength | null | undefined;
  pos: string;
  stretch: string;
}) {
  if (!strength) return <span className="muted">–</span>;
  return (
    <span className={LEVEL_CLASS[strength.level]} title={scheduleNote(strength, pos, stretch)}>
      {strength.place} of {strength.of}
    </span>
  );
}

/**
 * One direction of the trade: the players you send or receive, and what the
 * team getting them gains or loses in trade value, points per game and the
 * last games. Both sides sit near zero only when the trade balances.
 */
export function TradeSide({
  title,
  change,
  players,
  schedules,
}: {
  title: string;
  change: SideChange;
  players: Player[];
  /** Bye weeks and schedule strength (information only). */
  schedules: ReadonlyMap<string, PlayerSchedule>;
}) {
  const titleId = useId();
  const sport = useSport();
  const RECENT = sport.model.recentGames;
  // Teams play every week in multi-game sports (the NBA): no bye column there.
  const showBye = !sport.multiGameWeeks;
  const TRADE_VALUE_HINT = useTradeValueHint();
  const stats = [
    { label: "Trade value", value: change.trade, hint: TRADE_VALUE_HINT },
    { label: "Pts/g", value: change.ppg, hint: "Expected points per game" },
    { label: `Last ${RECENT}`, value: change.last, hint: `Points per game, last ${RECENT} games` },
  ];
  return (
    <section className={styles.team} aria-labelledby={titleId}>
      <div className={styles.teamHead}>
        <h4 id={titleId}>{title}</h4>
        <dl className={styles.changes}>
          {stats.map((st) => (
            <div key={st.label} className={styles.change} title={st.hint}>
              <dt>{st.label}</dt>
              <dd className={styles.big}>
                <Delta value={st.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {players.length === 0 ? (
        <p className="hint">No players picked.</p>
      ) : (
        <div className="table-wrap">
          <table className={`table ${styles.players}`}>
            <caption className="visually-hidden">{title}</caption>
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col" className="num" title={TRADE_VALUE_HINT}>
                  Trade
                  <br />
                  value
                </th>
                <th scope="col" className="num" title="Expected points per game">
                  Pts/g
                </th>
                <th scope="col" className="num">
                  Last {RECENT}
                </th>
                {showBye && (
                  <th scope="col" className="num" title="The week his team has no game">
                    Bye
                  </th>
                )}
                <th scope="col" className="num" title={`Regular season left: ${SCHEDULE_HINT}`}>
                  Regular
                  <br />
                  schedule
                </th>
                <th scope="col" className="num" title={`League playoff weeks: ${SCHEDULE_HINT}`}>
                  Playoffs
                  <br />
                  schedule
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PlayerCell player={p} />
                  </td>
                  <td className={`num ${styles.value}`}>
                    <TradeValue player={p} />
                  </td>
                  <td className="num">
                    {fmt(p.value)}
                    {p.injMult < 1 && (
                      <span className={styles.games}>
                        {p.noTeam ? "no team" : "injury"} −{pct(1 - p.injMult)}
                      </span>
                    )}
                  </td>
                  <td className="num">
                    <FormValue player={p} />
                  </td>
                  {showBye && (
                    <td className="num">
                      <ByeWeek schedule={schedules.get(p.id)} />
                    </td>
                  )}
                  <td className="num">
                    <StrengthCell
                      strength={schedules.get(p.id)?.regular}
                      pos={p.pos}
                      stretch="Regular season left"
                    />
                  </td>
                  <td className="num">
                    <StrengthCell
                      strength={schedules.get(p.id)?.playoffs}
                      pos={p.pos}
                      stretch="Playoffs"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
