import { useMemo } from "react";
import { fmt, ordinal } from "@/lib/format";
import type { Team } from "@/lib/league";
import { bestLineup, rosterPlayers, type Model, type Player } from "@/lib/model";
import { FormValue, PlayerCell, Sparkline, TradeValue, useTradeValueHint } from "./Player";
import { useSport } from "./SportContext";
import styles from "./TeamLineup.module.css";

function Row({
  slot,
  player,
  sparkMax,
}: {
  slot: string;
  player: Player | null;
  sparkMax: number;
}) {
  return (
    <tr>
      <th scope="row" className={styles.slot}>
        {slot}
      </th>
      {player ? (
        <>
          <td>
            <PlayerCell player={player} />
          </td>
          <td className={`num ${styles.value}`}>
            <TradeValue player={player} />
          </td>
          <td className={`num ${styles.ppg}`}>{fmt(player.value)}</td>
          <td className="num">
            <FormValue player={player} />
          </td>
          <td className={styles.weeks}>
            <Sparkline player={player} max={sparkMax} />
          </td>
        </>
      ) : (
        <td className={styles.empty} colSpan={5}>
          No eligible player
        </td>
      )}
    </tr>
  );
}

function Group({ label }: { label: string }) {
  return (
    <tr className={styles.group}>
      <td colSpan={6}>{label}</td>
    </tr>
  );
}

export function TeamLineup({
  model,
  teams,
  myRid,
  sparkMax,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
  sparkMax: number;
}) {
  const sport = useSport();
  const RECENT = sport.model.recentGames;
  const TRADE_VALUE_HINT = useTradeValueHint();
  const team = teams.find((t) => t.rid === myRid);
  const { lineup, bench, reserve, rank, hidden } = useMemo(() => {
    const players = rosterPlayers(model, team?.playerIds ?? []);
    const lu = bestLineup(players, model.slots, sport);
    const rest = players.filter((p) => !lu.used.has(p.id)).sort((a, b) => b.value - a.value);
    const totals = teams
      .map((t) => ({
        rid: t.rid,
        total: bestLineup(rosterPlayers(model, t.playerIds), model.slots, sport).total,
      }))
      .sort((a, b) => b.total - a.total);
    return {
      lineup: lu,
      bench: rest.filter((p) => p.startable),
      reserve: rest.filter((p) => !p.startable),
      rank: totals.findIndex((t) => t.rid === myRid) + 1,
      hidden: (team?.playerIds.length ?? 0) - players.length,
    };
  }, [model, teams, team, myRid, sport]);

  return (
    <>
      <div className={styles.strength}>
        <span className={styles.big}>{fmt(lineup.total)}</span>
        <span className={styles.unit}>expected points per game from your starters</span>
        <span className={styles.rank}>
          {ordinal(rank)} of {teams.length}
        </span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">
            Your best starting lineup, bench and unavailable players
          </caption>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Player</th>
              <th scope="col" className="num" title={TRADE_VALUE_HINT}>
                Trade value
              </th>
              <th scope="col" className={`num ${styles.ppg}`} title="Expected points per game">
                Pts/g
              </th>
              <th scope="col" className="num" title={`Average of the last ${RECENT} games`}>
                Last {RECENT}
              </th>
              <th scope="col" className={styles.weeks}>
                Weeks
              </th>
            </tr>
          </thead>
          <tbody>
            {model.slots.map((slot, i) => (
              <Row
                key={`${slot}-${i}`}
                slot={sport.slotLabels[slot] ?? slot}
                player={lineup.slots[i] ?? null}
                sparkMax={sparkMax}
              />
            ))}
            {bench.length > 0 && <Group label="Bench" />}
            {bench.map((p) => (
              <Row key={p.id} slot="BN" player={p} sparkMax={sparkMax} />
            ))}
            {reserve.length > 0 && <Group label="Unavailable" />}
            {reserve.map((p) => (
              <Row key={p.id} slot={p.noTeam ? "FA" : "IR"} player={p} sparkMax={sparkMax} />
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && (
        <p className="hint">
          {hidden} rostered player(s) are hidden because their position is not valued (for example,
          IDP).
        </p>
      )}
    </>
  );
}
