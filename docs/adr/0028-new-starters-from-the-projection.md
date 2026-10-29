# ADR 0028: New starters seen in the next game's projection

- Status: accepted
- Date: 2026-10-29
- Amends: ADR 0023 (lead role), ADR 0027 (mid-season trade value)

## Context

In week 8 the product owner found a rookie running back valued far below
what real trades pay for him (about 18 running back ranks). He had come back
from injury as his team's lead back: first on the depth chart, the most
carries in his return, and Sleeper's projection for the next game gave him
clearly the most targets and carries of his backfield. The other backs of
that team were valued in line with the market.

Three things kept him low:

- **The lead role of ADR 0023 needs 2 games** of lead usage and form far
  above the prior. A starter coming back from injury has one game of the
  new job; his early games were a rotation back's.
- **His prior was a rookie's conservative preseason projection**, still
  weighing 4 / (4 + games) (ADR 0027).
- **A week with only special-teams stats counts as a 0-point game.**
  Ignoring such weeks was tested again, in full and only for weeks before a
  player's first target or carry: both are worse in the points backtest
  (MAE 3.290 → 3.46-3.47) and only neutral when the actual results drop
  them too. Kept as is (as in ADR 0027).

## Decision

- **A lead by projection** (`roles.projectedLead`, NFL only). A player is
  also a lead when he is first on the depth chart, is projected the most
  targets + carries at his position on his team for the next game, has
  played at least 1 game, had at least 35% of a lead player's usage over his
  last 2 games, is not hurt, and his prior is at most `formJump` (0.4) of
  Sleeper's projection for the next game: the projection, not only his
  games, shows he took the job. Such a lead's prior is that next-game
  projection instead of the preseason one, fading as
  `reliabilityGames` / (`reliabilityGames` + games) like other leads.
- **Part of the usage measure looks ahead** (`projectedUsageBlend` 0.3,
  NFL only). The usage share in trade value is 70% the last 4 games and
  30% the share of the team's projected targets + carries in the next
  game. A player losing work to a new starter loses a little value before
  his own games show it.

Leads found by ADR 0023's rule keep their prior: giving them the next-game
projection as prior lifted backup quarterbacks starting for an injured
starter and lowered the quarterback correlation (0.935 → 0.927).

## Results

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (197 players), as in ADRs
0010, 0013, 0023 and 0027:

|                                               | Before                        | After                         |
| --------------------------------------------- | ----------------------------- | ----------------------------- |
| Rank correlation (all)                        | 0.933                         | 0.939                         |
| QB / RB / WR / TE                             | 0.935 / 0.933 / 0.947 / 0.897 | 0.934 / 0.940 / 0.948 / 0.906 |
| Top 24 QB / 48 RB / 60 WR / 24 TE             | 0.943 / 0.945 / 0.944 / 0.924 | 0.941 / 0.954 / 0.947 / 0.939 |
| Mean gap, in trade value at the market's rank | 1.68                          | 1.65                          |

Of 970 players, 10 moved by half a point or more and 1 by more than a point
(the new starter, +5.9; the largest drop was −0.8). Of the 6 that the market
lists, 5 moved closer to it. Replaying the league's trades of this season
with the stats of their week gives the same fairness verdicts.

The points backtest (`npm run backtest`) is unchanged (MAE 3.290, rank
0.472): past seasons have no depth chart, so roles cannot be backtested, and
the usage measure is part of trade value only.

## Alternatives considered

- **Waiting for a second game.** The current rule would call him a lead
  after another lead game, but trades happen in between and the market
  already moved.
- **Next-game projection as the prior of every lead.** Worse for
  quarterbacks (above).
- **50% of the usage measure from the projection.** Almost the same
  values (rank correlation 0.940), and more weight on a single
  weekly projection.
