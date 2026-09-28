import { fmt, pct } from "@/lib/format";
import { estimate, type ReplacementLevels, type StatsFile } from "@/lib/model";
import { NFL } from "@/lib/sports/nfl";
import styles from "./MethodNotes.module.css";

const P = NFL.model;

/** The blend for a veteran after some games, computed by the model itself. */
function exampleWeights(games: number): string {
  const w = estimate(
    { pos: "WR", g: games, seasonAvg: 10, lastAvg: 10, prevG: 16, prevPpg: 10, inj: null },
    null,
    P,
  ).weights;
  const parts = [`${pct(w.prev)} last season`, `${pct(w.season)} season average`];
  if (w.recent > 0) parts.push(`${pct(w.recent)} last ${P.recentGames}`);
  return `after ${games} game${games > 1 ? "s" : ""}: ${parts.join(", ")}`;
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
          <b>Pts/g</b> is the expected points per game from here on. It blends three things:
        </p>
        <ul>
          <li>
            <b>Last season ({stats.prev_season})</b>: what the player has already proven. It keeps a
            lot of weight early and fades as games are played this season, so one big game does not
            erase a track record.
          </li>
          <li>
            <b>This season ({stats.season})</b>: every game so far.
          </li>
          <li>
            <b>Last {P.recentGames} games</b>: current form, once there are more than{" "}
            {P.recentGames} games to compare with.
          </li>
        </ul>
        <p>
          Example weights {exampleWeights(1)}; {exampleWeights(3)}; {exampleWeights(8)}.
        </p>
        {P.usageBlend > 0 && (
          <p>
            <b>Usage.</b> Targets and carries are steadier than touchdowns, so for RBs, WRs and TEs{" "}
            {pct(P.usageBlend)} of each game counts as the points its targets and carries usually
            produce under your scoring. A player who gets the ball a lot but did not score yet is
            not punished much, and a lucky touchdown game does not count in full.
          </p>
        )}
        <p>
          Rookies and players without a track record start near replacement level and move away from
          it as they play. Players on IR count at half value and are never started; players listed
          as Out lose 10%.
          {P.noTeamMult !== null &&
            ` Players without an NFL team are never started and keep ${pct(P.noTeamMult)} of their value, in case someone signs them.`}
        </p>
        <p>
          <b>Replacement level</b> is what the best player left in free agency would score after
          every team in your league fills its starting slots. Right now:{" "}
          {NFL.positions.map((pos) => `${pos} ${fmt(repl[pos])}`).join(", ")} pts/game.
        </p>
        <p>
          <b>Trade value</b> is Pts/g minus the replacement level of the player&apos;s position: how
          much better he is than what you could pick up for free. It is the main number on this site
          and the currency of trade balance. Scarce positions are worth more, so a 23-point running
          back is worth far more than a 24-point quarterback when good quarterbacks sit in free
          agency.
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
