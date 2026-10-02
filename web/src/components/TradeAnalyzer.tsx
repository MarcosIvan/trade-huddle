import { useContext, useId, useMemo } from "react";
import { fmt, pct } from "@/lib/format";
import { teamLabel, type Team } from "@/lib/league";
import {
  bestLineup,
  evaluateTrade,
  idealNeeds,
  rosterPlayers,
  teamNeeds,
  type FreeAgentPool,
  type IdealRoster,
  type Model,
  type Player,
} from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import { BalanceMeter } from "./BalanceMeter";
import { Delta, FormValue, PlayerCell, TRADE_VALUE_HINT, TradeValue } from "./Player";
import { ScoreContext } from "./ScoreContext";
import styles from "./TradeAnalyzer.module.css";
import { rosterNotes } from "./TradeIdeas";

const RECENT = NFL.model.recentGames;

function PickList({
  label,
  players,
  selected,
  onToggle,
}: {
  label: string;
  players: Player[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const labelId = useId();
  const scores = useContext(ScoreContext);
  const worth = (p: Player) => scores.get(p.id)?.trade ?? p.vorp;
  const sorted = [...players].sort((a, b) => worth(b) - worth(a) || b.value - a.value);
  return (
    <div>
      <span className="label" id={labelId}>
        {label}
      </span>
      <div className={styles.picklist} role="group" aria-labelledby={labelId}>
        {sorted.length === 0 && <p className="hint">Empty roster.</p>}
        {sorted.map((p) => {
          const on = selected.has(p.id);
          return (
            <label key={p.id} className={`${styles.pick} ${on ? styles.on : ""}`}>
              <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} />
              <PlayerCell player={p} showScore={false} link={false} />
              <span className={`num ${styles.value}`} title={TRADE_VALUE_HINT}>
                <TradeValue player={p} />
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** What one side gains or loses: what it receives minus what it sends. */
interface SideChange {
  trade: number;
  ppg: number;
  last: number;
}

/** Received minus sent, in trade value (with the side discount), points per game and last games. */
function sideChange(sGet: number, sGive: number, get: Player[], give: Player[]): SideChange {
  const sum = (list: Player[], f: (p: Player) => number) => list.reduce((s, p) => s + f(p), 0);
  return {
    trade: sGet - sGive,
    ppg: sum(get, (p) => p.value) - sum(give, (p) => p.value),
    last: sum(get, (p) => p.lastAvg ?? 0) - sum(give, (p) => p.lastAvg ?? 0),
  };
}

/**
 * One direction of the trade: the players you send or receive, and what the
 * team getting them gains or loses in trade value, points per game and the
 * last games. Both sides sit near zero only when the trade balances.
 */
function TradeSide({
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

export function TradeAnalyzer({
  model,
  teams,
  myRid,
  partnerRid,
  give,
  get,
  pool,
  tradeScores,
  ideal,
  onPartner,
  onToggleGive,
  onToggleGet,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
  partnerRid: number | null;
  give: ReadonlySet<string>;
  get: ReadonlySet<string>;
  pool: FreeAgentPool;
  tradeScores: ReadonlyMap<string, number>;
  ideal: IdealRoster;
  onPartner: (rid: number) => void;
  onToggleGive: (id: string) => void;
  onToggleGet: (id: string) => void;
}) {
  const partnerId = useId();
  const partner = teams.find((t) => t.rid === partnerRid);
  const mine = useMemo(() => {
    const team = teams.find((t) => t.rid === myRid);
    return rosterPlayers(model, team?.playerIds ?? [], team?.reserveIds);
  }, [model, teams, myRid]);
  const theirs = useMemo(
    () => rosterPlayers(model, partner?.playerIds ?? [], partner?.reserveIds),
    [model, partner],
  );
  // Each team's needs by position, as in trade ideas; yours follow your ideal roster.
  const needs = useMemo(
    () =>
      teamNeeds(
        teams.map((t) => ({
          rid: t.rid,
          players: rosterPlayers(model, t.playerIds, t.reserveIds),
        })),
        model,
        NFL,
      ),
    [model, teams],
  );
  const others = [...teams]
    .filter((t) => t.rid !== myRid)
    .sort((a, b) => a.name.localeCompare(b.name));

  const result = useMemo(() => {
    const sending = mine.filter((p) => give.has(p.id));
    const getting = theirs.filter((p) => get.has(p.id));
    if (!sending.length && !getting.length) return null;
    return evaluateTrade(
      mine,
      theirs,
      sending,
      getting,
      bestLineup(mine, model.slots, NFL).total,
      bestLineup(theirs, model.slots, NFL).total,
      model,
      NFL,
      pool,
      tradeScores,
      {
        mine: idealNeeds(mine, ideal, needs.get(myRid)),
        theirs: partnerRid === null ? undefined : needs.get(partnerRid),
      },
      ideal,
    );
  }, [mine, theirs, give, get, model, pool, tradeScores, ideal, needs, myRid, partnerRid]);

  const partnerName = partner?.name ?? "Partner";

  return (
    <>
      <div className={`field ${styles.partner}`}>
        <label htmlFor={partnerId}>Trade with</label>
        <select
          id={partnerId}
          className="select"
          value={partnerRid ?? ""}
          onChange={(e) => onPartner(Number(e.target.value))}
        >
          {others.map((t) => (
            <option key={t.rid} value={t.rid}>
              {teamLabel(t)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.pickers}>
        <PickList label="You send" players={mine} selected={give} onToggle={onToggleGive} />
        <PickList
          label={`You get from ${partnerName}`}
          players={theirs}
          selected={get}
          onToggle={onToggleGet}
        />
      </div>

      <div aria-live="polite">
        {result && (
          <div className={`card ${styles.result}`}>
            <h3 className="visually-hidden">Trade result</h3>
            <BalanceMeter sGive={result.sGive} sGet={result.sGet} fairness={result.fairness} />
            <div className={styles.teams}>
              <TradeSide
                title="You send"
                change={sideChange(result.sGive, result.sGet, result.give, result.get)}
                players={result.give}
              />
              <TradeSide
                title="You receive"
                change={sideChange(result.sGet, result.sGive, result.get, result.give)}
                players={result.get}
              />
            </div>
            {result.warnings.map((w) => (
              <p key={w} className={`hint ${styles.warning}`}>
                <span aria-hidden="true">⚠ </span>
                {w}
              </p>
            ))}
            {rosterNotes(result, partnerName).map((n) => (
              <p key={n} className="hint">
                {n}
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
