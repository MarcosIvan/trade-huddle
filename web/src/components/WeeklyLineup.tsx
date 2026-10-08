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
import { PlayerCell } from "./Player";
import { useSport } from "./SportContext";
import styles from "./TeamLineup.module.css";
import weekly from "./WeeklyLineup.module.css";

/** A matchup label that reads without color: icon + word, and the number in the tooltip. */
function Matchup({ o, pos, noTeam }: { o: WeeklyOutlook; pos: string; noTeam: boolean }) {
  if (noTeam) return <span className="muted">No team</span>;
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
          <td className={`num ${styles.value}`}>{fmt(r.outlook.pts)}</td>
        </>
      ) : (
        <td className={styles.empty} colSpan={3}>
          No eligible player
        </td>
      )}
    </tr>
  );
}

function Group({ label }: { label: string }) {
  return (
    <tr className={styles.group}>
      <td colSpan={4}>{label}</td>
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
  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <caption className="visually-hidden">
            Your best lineup for week {week}, with opponents and projected points
          </caption>
          <thead>
            <tr>
              <th scope="col">Slot</th>
              <th scope="col">Player</th>
              <th scope="col">Matchup</th>
              <th scope="col" className="num" title="Projected points this week">
                Proj.
              </th>
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
