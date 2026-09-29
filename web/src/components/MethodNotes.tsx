import { fmt, pct } from "@/lib/format";
import {
  estimate,
  DEPTH_WEIGHT,
  MAX_STARTER_DIP,
  MAX_VALUE_LOSS,
  MIN_IDEA_FAIRNESS,
  SCORE_WEIGHTS,
  TRADE_VALUE_MAX,
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
          <b>Trade value</b> (1 to 40) is the main number on this site and the currency of trade
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
          <b>Player Score</b> (0 to 100, next to each name) gives up to {SCORE_WEIGHTS.trade} points
          for trade value (a {TRADE_VALUE_MAX} earns all {SCORE_WEIGHTS.trade}) plus up to{" "}
          {SCORE_WEIGHTS.importance} points for how important he is to his fantasy team.
        </p>
        <p>
          <b>Fairness</b> compares the trade value on each side, so a player is worth the same to
          both teams. Each side&apos;s best player counts in full, the second 85% and the third 70%,
          so two good players do not add up to a star. Green is a fair trade (90% or more), yellow
          could work but does not look fair (75% to 89%), red means don&apos;t do it.
        </p>
        <p>
          <b>Trade ideas</b>: the site tests every 1- or 2-player swap with every team and keeps
          deals that make your team better by at least {fmt(P.minGainMe)} pts/game, also make the
          partner&apos;s team better, and are at least {pct(MIN_IDEA_FAIRNESS)} fair, so neither
          side loses. Value comes first: an idea never costs you more than {pct(MAX_VALUE_LOSS)} of
          the trade value you send. Positions must stay sound on both rosters: every position you
          give away is refilled by a player you get back or a spare you already have (a free agent
          alone is not enough), nobody is left short of starters, and nobody piles up a position
          (such as a third QB in a one-QB league). Kickers and defenses are not traded. The three
          shown are fair first, then the ones where your starters gain more than the partner&apos;s,
          then the best matches: both lineups gaining alike, then each side getting the best player
          at a position where its lineup is weak (and sending from where it is strong), then
          refilled positions and players sent from your bench. A star marks a true match (fair, and
          both teams gain comparably), or the closest one when none is. There are always three: when
          fewer deals pass every rule, the nearest ones fill the list and say what they are missing.
        </p>
        <p>
          <b>Team gain</b> counts the starters plus bench depth: {pct(DEPTH_WEIGHT)} of what the
          best backup at each position scores above a free agent (about how often a starter misses a
          week). So getting a spare running back back in a trade counts, and a trade that leaves you
          thin costs something. Starters may dip at most {fmt(MAX_STARTER_DIP)} pts/game, and only
          when depth makes up for it.
        </p>
        <p>
          <b>Trade finder</b>: pick one of your players to sell, or a player from another team to
          get. The site tries 1-for-1, 2-for-1, 2-for-2 and 3-for-2 deals around him (never 3-for-1)
          with the same rules, and shows up to three, starring the best match. When no deal passes
          every rule, it shows the closest one and what it is missing.
        </p>
      </div>
    </details>
  );
}
