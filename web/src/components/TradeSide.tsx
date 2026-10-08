import { useId } from "react";
import { fmt, pct } from "@/lib/format";
import type { Player, SideChange } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import { Delta, FormValue, PlayerCell, TRADE_VALUE_HINT, TradeValue } from "./Player";
import styles from "./TradeSide.module.css";

const RECENT = NFL.model.recentGames;

/**
 * One direction of the trade: the players you send or receive, and what the
 * team getting them gains or loses in trade value, points per game and the
 * last games. Both sides sit near zero only when the trade balances.
 */
export function TradeSide({
  title,
  change,
  players,
}: {
  title: string;
  change: SideChange;
  players: Player[];
}) {
  const titleId = useId();
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
                  Trade value
                </th>
                <th scope="col" className="num" title="Expected points per game">
                  Pts/g
                </th>
                <th scope="col" className="num">
                  Last {RECENT}
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <PlayerCell player={p} showScore={false} />
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
