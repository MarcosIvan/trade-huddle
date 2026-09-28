import { fmt, pct } from "@/lib/format";
import type { ReplacementLevels, StatsFile } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import styles from "./MethodNotes.module.css";

const P = NFL.model;

function exampleWeights(games: number): string {
  const prev = Math.max(P.wPrevMin, P.wPrevStart - P.wPrevDecay * games);
  const rest = 1 - prev;
  return `after ${games} game${games > 1 ? "s" : ""}: ${pct(prev)} last season, ${pct(rest * (1 - P.recentShare))} season average, ${pct(rest * P.recentShare)} last ${P.recentGames}`;
}

/** How value is calculated, with this league's replacement levels. */
export function MethodNotes({ stats, repl }: { stats: StatsFile; repl: ReplacementLevels }) {
  return (
    <details className={styles.method}>
      <summary>How player value is calculated</summary>
      <div className={styles.body}>
        <p>
          Every point uses your league&apos;s scoring rules, applied to the official stats of each
          game.
        </p>
        <p>
          <b>Value</b> is the expected points per game from here on. It blends three things:
        </p>
        <ul>
          <li>
            <b>Last season ({stats.prev_season})</b>: what the player has already proven. It carries
            a lot of weight early and fades with every game played this season.
          </li>
          <li>
            <b>This season&apos;s average</b>: what he has done in {stats.season}.
          </li>
          <li>
            <b>Last {P.recentGames} games</b>: current form. It gets {pct(P.recentShare)} of this
            season&apos;s weight, so a player on a hot streak rises quickly.
          </li>
        </ul>
        <p>
          Example weights {exampleWeights(1)}; {exampleWeights(3)}; {exampleWeights(8)}.
        </p>
        <p>
          Rookies and players without a track record start near replacement level and move away from
          it as they play. Players on IR count at half value and are never started; players listed
          as Out lose 10%.
        </p>
        <p>
          <b>Replacement level</b> is what the best player left in free agency would score after
          every team in your league fills its starting slots. Right now:{" "}
          {NFL.positions.map((pos) => `${pos} ${fmt(repl[pos])}`).join(", ")} pts/game.
        </p>
        <p>
          <b>Above replacement</b> is value minus the replacement level of the player&apos;s
          position. It is the currency used for trade balance: a 14-point RB is worth more than a
          9-point kicker because the RB is much harder to replace.
        </p>
        <p>
          <b>Trade ideas</b>: the site tests every 1- or 2-player swap with every team. It only
          shows deals that raise your starters by at least {fmt(P.minGainMe)} pts/game, also raise
          the partner&apos;s starters, and keep both sides close in value (the smaller side is worth
          at least {pct(P.minFairness)} of the larger one).
        </p>
      </div>
    </details>
  );
}
