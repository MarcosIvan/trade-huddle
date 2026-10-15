import { useContext, useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import { teamLabel, type Team } from "@/lib/league";
import { positionLeaders, type LeaderSort, type Model, type Player } from "@/lib/model";
import { PlayerCell, TradeValue, useTradeValueHint } from "./Player";
import { ScoreContext } from "./ScoreContext";
import { Segmented } from "./Segmented";
import { useSport } from "./SportContext";
import styles from "./PositionLeaders.module.css";

const SORTS: { value: LeaderSort; label: string }[] = [
  { value: "value", label: "Trade value" },
  { value: "points", label: "Season points" },
];

/**
 * The league's best players at each position, rostered or free agents, by
 * trade value or by fantasy points this season; your players are highlighted.
 */
export function PositionLeaders({
  model,
  teams,
  myRid,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
}) {
  const sport = useSport();
  const scores = useContext(ScoreContext);
  const valueHint = useTradeValueHint();
  const [chosenPos, setPos] = useState<string | null>(null);
  const [by, setBy] = useState<LeaderSort>("value");
  const pos = chosenPos && sport.positions.includes(chosenPos) ? chosenPos : sport.positions[0]!;

  const leaders = useMemo(
    () => positionLeaders(model, teams, pos, by, (p: Player) => scores.get(p.id)?.trade ?? p.vorp),
    [model, teams, pos, by, scores],
  );
  const owner = (rid: number | null) => {
    if (rid === null) return "Free agent";
    if (rid === myRid) return "You";
    const team = teams.find((t) => t.rid === rid);
    return team ? teamLabel(team) : "";
  };
  const sorted = (key: LeaderSort) => `num ${by === key ? styles.sorted : ""}`;

  return (
    <div className={styles.leaders}>
      <div className={styles.controls}>
        <Segmented
          legend="Position"
          options={sport.positions.map((p) => ({ value: p, label: p }))}
          value={pos}
          onChange={setPos}
        />
        <Segmented legend="Rank by" options={SORTS} value={by} onChange={setBy} />
      </div>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">
            Top {pos} players in the league by {by === "value" ? "trade value" : "season points"}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="num">
                #
              </th>
              <th scope="col">Player</th>
              <th scope="col">Fantasy team</th>
              <th scope="col" className={sorted("value")} title={valueHint}>
                Trade value
              </th>
              <th scope="col" className={sorted("points")} title="Fantasy points this season">
                Season pts
              </th>
              <th scope="col" className="num" title="Fantasy points per game played this season">
                Pts/g
              </th>
            </tr>
          </thead>
          <tbody>
            {leaders.map((l, i) => (
              <tr key={l.player.id} className={l.rid === myRid ? styles.mine : undefined}>
                <td className="num">{i + 1}</td>
                <td>
                  <PlayerCell player={l.player} />
                </td>
                <td className={styles.owner}>{owner(l.rid)}</td>
                <td className={sorted("value")}>
                  <TradeValue player={l.player} />
                </td>
                <td className={sorted("points")}>{fmt(l.points)}</td>
                <td className="num">{fmt(l.ppg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
