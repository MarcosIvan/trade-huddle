import { useId, useMemo } from "react";
import { teamLabel, type Team } from "@/lib/league";
import {
  bestLineup,
  evaluateTrade,
  idealNeeds,
  rosterNotes,
  rosterPlayers,
  sideChange,
  teamNeeds,
  type FreeAgentPool,
  type IdealRoster,
  type Model,
} from "@/lib/model";
import { BalanceMeter } from "./BalanceMeter";
import { PickList } from "./PickList";
import { useSport } from "./SportContext";
import styles from "./TradeAnalyzer.module.css";
import { TradeSide } from "./TradeSide";

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
  const sport = useSport();
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
        sport,
      ),
    [model, teams, sport],
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
      bestLineup(mine, model.slots, sport).total,
      bestLineup(theirs, model.slots, sport).total,
      model,
      sport,
      pool,
      tradeScores,
      {
        mine: idealNeeds(mine, ideal, needs.get(myRid)),
        theirs: partnerRid === null ? undefined : needs.get(partnerRid),
      },
      ideal,
    );
  }, [mine, theirs, give, get, model, pool, tradeScores, ideal, needs, myRid, partnerRid, sport]);

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
