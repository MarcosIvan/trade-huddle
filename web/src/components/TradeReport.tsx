import { fmt } from "@/lib/format";
import type { Team } from "@/lib/league";
import { rosterPlayers, type Model, type ReportSide, type ReportTrade } from "@/lib/model";
import { IdeaChip, IdeaSide } from "./IdeaFrame";
import styles from "./TradeReport.module.css";

/** "Nov 4" for a trade's date. */
const day = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function Side({
  side,
  label,
  model,
  valueAhead,
  pointsAhead,
}: {
  side: ReportSide;
  label: string;
  model: Model;
  valueAhead: boolean;
  pointsAhead: boolean;
}) {
  const extras = [
    ...side.picks.map((p) => `${p} pick`),
    ...(side.faab ? [`$${side.faab} FAAB`] : []),
  ];
  return (
    <div className={styles.side}>
      <IdeaSide label={label} players={rosterPlayers(model, side.players)} />
      {extras.length > 0 && <p className={styles.extras}>+ {extras.join(", ")}</p>}
      <div className={styles.chips}>
        <IdeaChip
          tone={valueAhead ? "plus" : undefined}
          title="Trade value today of what this team received"
        >
          Value today <b>{fmt(side.value)}</b>
        </IdeaChip>
        <IdeaChip
          tone={pointsAhead ? "plus" : undefined}
          title="Points these players scored as starters for this team since the trade"
        >
          Points since <b>{fmt(side.points)}</b>
        </IdeaChip>
      </div>
    </div>
  );
}

/**
 * The league's completed trades, newest first: what each team received and
 * who is ahead, by value today and by points since (the green chips).
 */
export function TradeReport({
  trades,
  teams,
  myRid,
  model,
}: {
  trades: ReportTrade[];
  teams: Team[];
  myRid: number;
  model: Model;
}) {
  if (!trades.length) {
    return <p className={`card ${styles.empty}`}>No trades in the league yet this season.</p>;
  }
  const name = (rid: number) =>
    rid === myRid ? "You" : (teams.find((t) => t.rid === rid)?.name ?? `Team ${rid}`);
  return (
    <div className={styles.list}>
      {trades.map((t) => (
        <article
          key={t.id}
          className={`card ${styles.card}`}
          aria-label={`Trade between ${t.sides.map((s) => name(s.rid)).join(" and ")}`}
        >
          <p className={styles.when}>
            Week {t.week} · {day(t.created)}
          </p>
          <div className={styles.sides}>
            {t.sides.map((s) => (
              <Side
                key={s.rid}
                side={s}
                label={`${name(s.rid)} got`}
                model={model}
                valueAhead={t.valueLeader === s.rid}
                pointsAhead={t.pointsLeader === s.rid}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
