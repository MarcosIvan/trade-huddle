# ADR 0005: Weekly lineup from Sleeper's weekly projection and our value

- Status: accepted
- Date: 2026-09-28
- Amended by: ADR 0011 (the projection's own weight is now 0.65, as our value
  already holds 30% of it)

## Context

Rest-of-season value answers "who is worth more", not "who should I start
this week". A weekly lineup needs the opponent: what that defense allows to
the position. The product owner also asked to use how a player did against
defenses similar to this week's opponent.

Sleeper publishes the schedule and a projection for every player and week
(from Rotowire, already matchup-aware), for past seasons too. The pipeline
stores the schedule, the week to set a lineup for (the first week with a game
not played yet) and that week's projection, as stat lines scored with each
league's rules.

## Decision

This week's points for a player are

    (1 − 0.75) × value × matchup^0.5  +  0.75 × Sleeper's weekly projection

times his chance to play (Questionable 85%, Doubtful 25%, Out/IR/PUP/Sus 0;
byes and players without a team score 0). `matchup` is what the opponent
allowed to the position per game so far, relative to the league average,
pulled toward average by two games of an average defense.

The site shows a "This week" tab with the best lineup by these points, each
player's opponent and a matchup label (Good / Neutral / Tough, with an icon
and the exact percentage in a tooltip), next to the existing rest-of-season
lineup.

## Evidence

Week-ahead backtest (`npm run backtest:weekly`): with data through week N,
predict week N+1, for N = 3..16 of 2024 and 2025, half-PPR and PPR, over the
top of each position by prediction (QB 24, RB 48, WR 60, TE 24):

| Model                                     | MAE (pts) | Rank correlation |
| ----------------------------------------- | --------- | ---------------- |
| Our value only                            | 5.60      | 0.37             |
| Sleeper's weekly projection only          | 5.58      | 0.39             |
| **75% Sleeper + 25% value × matchup^0.5** | **5.53**  | **0.38**         |

- The blend is the most accurate. Single weeks are noisy, so gains are small.
- Our own matchup factor adds little on top of Sleeper's projection, which
  already accounts for the opponent (5.530 with it, 5.530 without); it is
  kept at a moderate weight because the site shows it as context.
- "Results against similar defenses" did not help (5.533 vs 5.530): a player
  has only a handful of games against any group of defenses. It is
  implemented (`similarWeight`) and switched off.
- Kickers and defenses are close to unpredictable week to week (rank
  correlation near 0 for every model) and are left out of the metric.

## Consequences

- Early in the week the lineup week can still be the week in progress (for
  example on a Monday before the late game); it moves on once every game of
  the week is complete.
- The weekly view depends on Sleeper publishing weekly projections; without
  them it falls back to value × matchup.
