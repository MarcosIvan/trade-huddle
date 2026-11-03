# ADR 0032: A hot stretch is not a new job

- Status: accepted
- Date: 2026-11-03
- Amends: ADR 0023 (lead role), ADR 0028 (lead by projection)

## Context

After week 8 the product owner found some running backs whose trade value
had jumped far more in two weeks than real trades pay for them. One of them
had been his team's lead back since week 2, with a third to almost half of
the team's targets + carries every week; his workload grew a little and he
had two big games. His value went up about 9.5 points in two weeks and sat
about 6 above the market. A rotation back with two good games did the same.

Most of the move was not the games themselves but ADR 0023's lead rule. A
player first on the depth chart, with lead usage, whose prior is at most
`formJump` (0.4) of his recent form, "took the job this season": his prior
fades as 2 / (2 + games) instead of 8 / (8 + games), and the base measure of
his trade value uses his expected points instead of the prior. At 0.4, recent
form 2.5 times the prior is enough, and a starter all along with a low
preseason projection gets there with a hot stretch. Crossing the line moved
that player's value by about 5 points in a single week.

## Decision

`roles.formJump` goes from 0.4 to 0.35 (NFL; the NBA has no roles): a lead
now needs recent form (or, per ADR 0028, the next game's projection) at
least about 2.9 times his prior. Nothing else changes.

## Results

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (197 players), as in ADRs
0010, 0013, 0023, 0027 and 0028:

|                                               | Before                        | After                         |
| --------------------------------------------- | ----------------------------- | ----------------------------- |
| Rank correlation (all)                        | 0.923                         | 0.927                         |
| QB / RB / WR / TE                             | 0.905 / 0.945 / 0.929 / 0.919 | 0.905 / 0.950 / 0.930 / 0.924 |
| Top 24 QB / 48 RB / 60 WR / 24 TE             | 0.948 / 0.942 / 0.929 / 0.943 | 0.947 / 0.956 / 0.929 / 0.943 |
| Mean gap, in trade value at the market's rank | 1.95                          | 1.91                          |

Of 1054 players, 10 moved by half a point or more and 3 by more than a
point, all down (the largest −4.3; the largest rise +0.5). The two backs
above stay above the market, by about 3 points instead of 6 to 7: the rest
is real production the market discounts more than the model does. A rookie
who did take over his backfield keeps his value, in line with the market.
Of the 10 movers, all listed by the market, 4 moved closer to it; the
others moved at most about a point further, one of them (a starter back
from injury) from 2 above the market to 2 below.

Replaying weeks 5 to 8 with the stats of each week (today's depth chart and
projections), the mean weekly change of players worth 12 or more goes from
0.91 to 0.90, and weekly moves of 4 points or more from 12 to 10.

The points backtest (`npm run backtest`) is unchanged (MAE 3.290, rank
0.472): past seasons have no depth chart, so roles cannot be backtested.

## Alternatives considered

- **A ramp instead of a line.** The prior's games going from 8 to 2 step
  by step as the form grows from 2.5 to 5 times the prior (and the base
  measure moving with them). Tuned to its best, it matched 0.35 (rank
  correlation 0.927, mean gap 1.92, the same weekly moves) with more code
  and one more parameter.
- **Less weight on recent games** in trade value or in the points per
  game (`recentShare` 0.25 → 0.15). Almost no effect on these players: the
  jump came from the lead rule.
- **A longer fade for leads** (`reliabilityGames` 2 → 4 or 6). Smaller
  gains (0.925) and it slows down players who did take a job.
- **0.33.** The same values as 0.35 on this league.
