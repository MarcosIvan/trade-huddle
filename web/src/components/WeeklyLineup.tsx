import { fmt } from "@/lib/format";
import {
  matchupLevel,
  matchupNote,
  type Model,
  type WeekLineup,
  type WeekRated,
  type WeeklyOutlook,
} from "@/lib/model";
import { MatchupBadge } from "./MatchupBadge";
import { PlayerCell, TradeValue, useTradeValueHint } from "./Player";
import { useSport } from "./SportContext";
import styles from "./TeamLineup.module.css";
import weekly from "./WeeklyLineup.module.css";

/**
 * Every game left this week (several a week, as in the NBA), two to a line: each
 * opponent with its matchup as an icon (the word for screen readers, the number in the tooltip).
 */
function Games({ o, pos }: { o: WeeklyOutlook; pos: string }) {
  return (
    <span className={weekly.games}>
      {o.games.map((g) => (
        <span
          key={g.period}
          className={weekly.game}
          title={matchupNote(g.opponent, g.matchup, pos)}
        >
          <span className={weekly.opp}>
            {g.home ? "vs" : "@"} {g.opponent}
          </span>
          {o.availability > 0 && <MatchupBadge level={matchupLevel(g.matchup)} compact />}
        </span>
      ))}
    </span>
  );
}

/** A matchup label that reads without color: icon + word, and the number in the tooltip. */
function Matchup({ o, pos, noTeam }: { o: WeeklyOutlook; pos: string; noTeam: boolean }) {
  const several = useSport().multiGameWeeks;
  if (noTeam) return <span className="muted">No team</span>;
  if (several) {
    return o.games.length ? <Games o={o} pos={pos} /> : <span className="muted">No games</span>;
  }
  if (o.bye || !o.opponent) return <span className="muted">Bye</span>;
  if (o.availability === 0) {
    return (
      <span className={weekly.opp}>
        {o.home ? "vs" : "@"} {o.opponent}
      </span>
    );
  }
  return (
    <span className={weekly.matchup} title={matchupNote(o.opponent, o.matchup, pos)}>
      <span className={weekly.opp}>
        {o.home ? "vs" : "@"} {o.opponent}
      </span>
      <MatchupBadge level={matchupLevel(o.matchup)} />
    </span>
  );
}

/** A lineup row: slot, player, this week's games, trade value and projection. */
function Row({ slot, r }: { slot: string; r: WeekRated | null }) {
  return (
    <tr>
      <th scope="row" className={styles.slot}>
        {slot}
      </th>
      {r ? (
        <>
          <td>
            <PlayerCell player={r.player} />
          </td>
          <td>
            <Matchup o={r.outlook} pos={r.player.pos} noTeam={r.player.noTeam} />
          </td>
          <td className="num">
            <TradeValue player={r.player} />
          </td>
          <td className={`num ${styles.value}`}>{fmt(r.outlook.pts)}</td>
        </>
      ) : (
        <td className={styles.empty} colSpan={4}>
          No eligible player
        </td>
      )}
    </tr>
  );
}

function Group({ label }: { label: string }) {
  return (
    <tr className={styles.group}>
      <td colSpan={5}>{label}</td>
    </tr>
  );
}

/** The best lineup for this week's games: projected points, opponent and matchup. */
export function WeeklyLineup({
  model,
  week,
  rated: { lineup, bench, ir },
}: {
  model: Model;
  week: number;
  rated: WeekLineup;
}) {
  const sport = useSport();
  const tradeValueHint = useTradeValueHint();
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">
            Your best lineup for week {week}, with{" "}
            {sport.multiGameWeeks ? "each game left" : "opponents"} and projected points
          </caption>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Player</th>
              <th scope="col">{sport.multiGameWeeks ? "Games" : "Matchup"}</th>
              <th scope="col" className="num" title={tradeValueHint}>
                Trade value
              </th>
              {sport.multiGameWeeks ? (
                <th
                  scope="col"
                  className="num"
                  title="Highest projected points of his games this week: his best game counts"
                >
                  High proj.
                </th>
              ) : (
                <th scope="col" className="num" title="Projected points this week">
                  Proj.
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {model.slots.map((slot, i) => (
              <Row
                key={`${slot}-${i}`}
                slot={sport.slotLabels[slot] ?? slot}
                r={lineup.slots[i] ?? null}
              />
            ))}
            {bench.length > 0 && <Group label="Bench" />}
            {bench.map((r) => (
              <Row key={r.id} slot="BN" r={r} />
            ))}
            {ir.length > 0 && <Group label="Injured reserve" />}
            {ir.map((r) => (
              <Row key={r.id} slot="IR" r={r} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
