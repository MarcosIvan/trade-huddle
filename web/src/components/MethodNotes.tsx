import { fmt, pct } from "@/lib/format";
import {
  estimate,
  MAX_VALUE_LOSS,
  MIN_IDEA_FAIRNESS,
  SCORE_WEIGHTS,
  TRADE_VALUE_WEIGHTS,
  type ReplacementLevels,
  type StatsFile,
} from "@/lib/model";
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
          <b>Trade value</b> (1 to 100) is the main number on this site and the currency of trade
          fairness. It combines several measures, each compared across the league:{" "}
          {TRADE_VALUE_WEIGHTS.base} points for his proven base (preseason projection or last
          season), {TRADE_VALUE_WEIGHTS.market} for where drafters took him (fading as games are
          played), {TRADE_VALUE_WEIGHTS.expected} for expected points per game,{" "}
          {TRADE_VALUE_WEIGHTS.season} for this season, {TRADE_VALUE_WEIGHTS.recent} for the last{" "}
          {P.recentGames} games, {TRADE_VALUE_WEIGHTS.edge} for how far he is above the average
          starter at his position, {TRADE_VALUE_WEIGHTS.scarcity} for points above a free agent and{" "}
          {TRADE_VALUE_WEIGHTS.usage} for his share of his NFL offense&apos;s targets and carries.
          Early in the season, when this season and the last {P.recentGames} games are the same
          games, they count once and the base carries more. Scarce positions are scaled up, injured
          players lose part of their value (they come back), and nobody is worth less than 1.
        </p>
        <p>
          <b>Player Score</b> (0 to 100, next to each name) is {pct(SCORE_WEIGHTS.trade)} of the
          trade value plus up to {SCORE_WEIGHTS.importance} points for how important he is to his
          fantasy team.
        </p>
        <p>
          <b>Fairness</b> compares the trade value on each side, so a player is worth the same to
          both teams. Each side&apos;s best player counts in full, the second 85% and the third 70%,
          so two good players do not add up to a star. Green is a fair trade (90% or more), yellow
          could work but does not look fair (75% to 89%), red means don&apos;t do it.
        </p>
        <p>
          <b>Trade ideas</b>: the site tests every 1- or 2-player swap with every team and keeps
          deals that raise your starters by at least {fmt(P.minGainMe)} pts/game, also raise the
          partner&apos;s starters, and are at least {pct(MIN_IDEA_FAIRNESS)} fair, so neither side
          loses. Value comes first: an idea never costs you more than {pct(MAX_VALUE_LOSS)} of the
          trade value you send. Positions must stay sound on both rosters: every position you give
          away is refilled (or you have a spare), nobody is left short of starters, and nobody piles
          up a position (such as a third QB in a one-QB league). The three shown are the best
          matches: fair first, then both lineups gaining alike, then each side getting the best
          player at a position where its lineup is weak (and sending from where it is strong), then
          refilled positions and players sent from your bench. A star marks a true match (fair, and
          both teams gain comparably), or the closest one when none is.
        </p>
      </div>
    </details>
  );
}
