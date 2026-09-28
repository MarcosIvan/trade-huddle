import { useMemo } from "react";
import { fmt } from "@/lib/format";
import type { Team } from "@/lib/league";
import {
  bestLineup,
  rosterPlayers,
  type Model,
  type Player,
  type Valued,
  type WeeklyOutlook,
} from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import { PlayerCell } from "./Player";
import styles from "./TeamLineup.module.css";
import weekly from "./WeeklyLineup.module.css";

type Rated = Valued & { player: Player; outlook: WeeklyOutlook };

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
  const diff = o.matchup - 1;
  const kind = diff >= 0.08 ? "good" : diff <= -0.08 ? "tough" : "neutral";
  const label = { good: "Good", tough: "Tough", neutral: "Neutral" }[kind];
  const icon = { good: "▲", tough: "▼", neutral: "●" }[kind];
  const pct = Math.round(Math.abs(diff) * 100);
  const title =
    kind === "neutral"
      ? `${o.opponent} allows about the average to ${pos}s`
      : `${o.opponent} allows ${pct}% ${diff > 0 ? "more" : "fewer"} points than average to ${pos}s`;
  return (
    <span className={weekly.matchup} title={title}>
      <span className={weekly.opp}>
        {o.home ? "vs" : "@"} {o.opponent}
      </span>
      <span className={`${weekly.badge} ${weekly[kind]}`}>
        <span aria-hidden="true">{icon}</span> {label}
      </span>
    </span>
  );
}

function Row({ slot, r }: { slot: string; r: Rated | null }) {
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
  teams,
  myRid,
  week,
  outlook,
}: {
  model: Model;
  teams: Team[];
  myRid: number;
  week: number;
  outlook: ReadonlyMap<string, WeeklyOutlook>;
}) {
  const team = teams.find((t) => t.rid === myRid);
  const { lineup, bench, out } = useMemo(() => {
    const rated: Rated[] = rosterPlayers(model, team?.playerIds ?? []).map((p) => {
      const o = outlook.get(p.id) ?? {
        pts: 0,
        opponent: null,
        home: false,
        matchup: 1,
        bye: true,
        availability: 1,
      };
      return { ...p, player: p, outlook: o, value: o.pts, startable: !o.bye && o.availability > 0 };
    });
    const lu = bestLineup(rated, model.slots, NFL);
    const rest = rated.filter((r) => !lu.used.has(r.id)).sort((a, b) => b.value - a.value);
    return {
      lineup: lu,
      bench: rest.filter((r) => r.startable),
      out: rest.filter((r) => !r.startable),
    };
  }, [model, team, outlook]);

  return (
    <>
      <div className={styles.strength}>
        <span className={styles.big}>{fmt(lineup.total)}</span>
        <span className={styles.unit}>projected points for week {week}</span>
      </div>
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
                slot={NFL.slotLabels[slot] ?? slot}
                r={lineup.slots[i] ?? null}
              />
            ))}
            {bench.length > 0 && <Group label="Bench" />}
            {bench.map((r) => (
              <Row key={r.id} slot="BN" r={r} />
            ))}
            {out.length > 0 && <Group label="Not playing this week" />}
            {out.map((r) => (
              <Row key={r.id} slot={r.player.noTeam ? "FA" : r.outlook.bye ? "BYE" : "OUT"} r={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        Projections blend Sleeper&apos;s weekly projection with this site&apos;s value, adjusted for
        what each opponent allows to the position. Questionable and Doubtful players are discounted
        by their chance to play.
      </p>
    </>
  );
}
