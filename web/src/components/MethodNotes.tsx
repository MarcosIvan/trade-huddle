import { fmt, pct } from "@/lib/format";
import { estimate, SCORE_WEIGHTS, type ReplacementLevels, type StatsFile } from "@/lib/model";
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
  const parts = [`${pct(w.prev)} outlook`, `${pct(w.season)} season average`];
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
            <b>The outlook</b>: Sleeper&apos;s preseason projection for {stats.season}, which
            already weighs last season, age, role changes and rookies
            {P.projWeight < 1 && <> (blended with {stats.prev_season})</>}. Players without a
            projection use last season ({stats.prev_season}). It keeps a lot of weight early and
            fades as games are played, so one big game does not erase a track record.
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
          <b>Player Score</b> (0 to 100, next to each name): {SCORE_WEIGHTS.level} points for trade
          value, {SCORE_WEIGHTS.form} for recent form above replacement, and{" "}
          {SCORE_WEIGHTS.importance} for how important he is to his fantasy team, plus up to{" "}
          {SCORE_WEIGHTS.usage} bonus points for the three main weapons of each NFL offense (share
          of the team&apos;s targets and carries; the first gets the most).
        </p>
        <p>
          <b>Fairness</b> compares the Player Scores on each side without the team-importance part,
          so a player is worth the same to both teams: green is a fair trade (90% or more), yellow
          could work but does not look fair (75% to 89%), red means don&apos;t do it.
        </p>
        <p>
          <b>Trade ideas</b>: the site tests every 1- or 2-player swap with every team and keeps
          deals that raise your starters by at least {fmt(P.minGainMe)} pts/game, also raise the
          partner&apos;s starters, and are never red. The three shown are the best matches: fair
          first, then both lineups gaining alike, then sending players from your bench. A star marks
          a true match (fair, and both teams gain comparably), or the closest one when none is.
        </p>
      </div>
    </details>
  );
}
