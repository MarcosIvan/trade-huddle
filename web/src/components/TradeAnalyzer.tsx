import { useId, useMemo } from "react";
import { fmt, pct } from "@/lib/format";
import type { Team } from "@/lib/league";
import {
  bestLineup,
  evaluateTrade,
  rosterPlayers,
  type FreeAgentPool,
  type Model,
  type Player,
  type StatsFile,
} from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import { BalanceMeter } from "./BalanceMeter";
import { Delta, FormValue, PlayerCell, Sparkline, TRADE_VALUE_HINT } from "./Player";
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
  const sorted = [...players].sort((a, b) => b.vorp - a.vorp || b.value - a.value);
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
              <PlayerCell player={p} />
              <span className={`num ${styles.value}`} title={TRADE_VALUE_HINT}>
                {fmt(p.vorp)}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function valueMix(p: Player, prevSeason: string): string {
  const w = p.weights;
  const parts: string[] = [];
  if (w.prev > 0.005) {
    const outlook = p.projPpg !== null && NFL.model.projWeight > 0;
    parts.push(`${pct(w.prev)} ${outlook ? "outlook" : prevSeason}`);
  }
  if (w.season > 0.005) parts.push(`${pct(w.season)} season`);
  if (w.recent > 0.005) parts.push(`${pct(w.recent)} last ${RECENT}`);
  if (w.repl > 0.005) parts.push(`${pct(w.repl)} replacement`);
  return parts.join(" · ");
}

export function TradeAnalyzer({
  model,
  stats,
  teams,
  myRid,
  partnerRid,
  give,
  get,
  sparkMax,
  pool,
  tradeScores,
  onPartner,
  onToggleGive,
  onToggleGet,
}: {
  model: Model;
  stats: StatsFile;
  teams: Team[];
  myRid: number;
  partnerRid: number | null;
  give: ReadonlySet<string>;
  get: ReadonlySet<string>;
  sparkMax: number;
  pool: FreeAgentPool;
  tradeScores: ReadonlyMap<string, number>;
  onPartner: (rid: number) => void;
  onToggleGive: (id: string) => void;
  onToggleGet: (id: string) => void;
}) {
  const partnerId = useId();
  const partner = teams.find((t) => t.rid === partnerRid);
  const mine = useMemo(
    () => rosterPlayers(model, teams.find((t) => t.rid === myRid)?.playerIds ?? []),
    [model, teams, myRid],
  );
  const theirs = useMemo(() => rosterPlayers(model, partner?.playerIds ?? []), [model, partner]);
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
    );
  }, [mine, theirs, give, get, model, pool, tradeScores]);

  const partnerName = partner?.name ?? "Partner";
  const read = !result
    ? ""
    : result.dMe > 0.05 && result.dThem > 0.05
      ? "Both teams improve, so this has a good chance of being accepted."
      : result.dThem <= 0.05
        ? `${partnerName}'s starters don't improve, so this will be a hard sell.`
        : "Your starters don't improve with this deal.";

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
              {t.name}
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

      <div className={styles.result} aria-live="polite">
        {!result ? (
          <p className="hint">
            Pick at least one player on each side, or open one of the trade ideas above.
          </p>
        ) : (
          <>
            <h3 className="visually-hidden">Trade result</h3>
            <div className={styles.stats}>
              <div className={`card ${styles.stat}`}>
                <span className="label">Your starters</span>
                <span className={styles.big}>
                  <Delta value={result.dMe} />
                </span>
                <span className={styles.small}>
                  {fmt(result.meBefore)} → {fmt(result.meAfter)} pts/game
                </span>
              </div>
              <div className={`card ${styles.stat}`}>
                <span className="label">{partnerName}&apos;s starters</span>
                <span className={styles.big}>
                  <Delta value={result.dThem} />
                </span>
                <span className={styles.small}>
                  {fmt(result.themBefore)} → {fmt(result.themAfter)} pts/game
                </span>
              </div>
              <div className={`card ${styles.stat}`}>
                <span className="label">Fairness</span>
                <BalanceMeter sGive={result.sGive} sGet={result.sGet} fairness={result.fairness} />
                <span className={styles.small}>{read}</span>
              </div>
            </div>

            <div
              className="table-wrap"
              role="region"
              aria-label="Players in this trade"
              tabIndex={0}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Side</th>
                    <th scope="col">Player</th>
                    <th scope="col" className="num">
                      {stats.prev_season}
                    </th>
                    <th scope="col" className="num">
                      {stats.season}
                    </th>
                    <th scope="col" className="num">
                      Last {RECENT}
                    </th>
                    <th scope="col">Weeks</th>
                    <th scope="col" className="num" title="Expected points per game">
                      Pts/g
                    </th>
                    <th scope="col" className="num" title={TRADE_VALUE_HINT}>
                      Trade value
                    </th>
                    <th scope="col">Pts/g mix</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...result.give.map((p) => ({ p, side: "You send" })),
                    ...result.get.map((p) => ({ p, side: "You get" })),
                  ].map(({ p, side }) => (
                    <tr key={p.id}>
                      <td className="muted">{side}</td>
                      <td>
                        <PlayerCell player={p} />
                      </td>
                      <td className="num">
                        {fmt(p.prevPpg)}
                        {p.prevG > 0 && <span className={styles.games}>{p.prevG} g</span>}
                      </td>
                      <td className="num">
                        {fmt(p.seasonAvg)}
                        {p.g > 0 && <span className={styles.games}>{p.g} g</span>}
                      </td>
                      <td className="num">
                        <FormValue player={p} />
                      </td>
                      <td>
                        <Sparkline player={p} max={sparkMax} />
                      </td>
                      <td className="num">
                        {fmt(p.value)}
                        {p.injMult < 1 && (
                          <span className={styles.games}>
                            {p.noTeam ? "no team" : "injury"} −{pct(1 - p.injMult)}
                          </span>
                        )}
                      </td>
                      <td className={`num ${styles.value}`}>{fmt(p.vorp)}</td>
                      <td className={styles.mix}>{valueMix(p, stats.prev_season)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rosterNotes(result, partnerName).map((n) => (
              <p key={n} className="hint">
                {n}
              </p>
            ))}
            <p className="hint">
              All numbers are points per game under your league&apos;s scoring. Balance compares how
              much each player scores above a replacement-level player.
            </p>
          </>
        )}
      </div>
    </>
  );
}
