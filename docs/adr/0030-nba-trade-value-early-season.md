# ADR 0030: NBA trade value against the early-season market

- Status: accepted
- Date: 2026-10-30
- Amends: ADR 0020 (NBA trade value weights), ADR 0022 (centers' discount)

## Context

ADR 0022 kept the centers' market discount at 0.35, against the 0.2 that
fits the draft market best, until trade values could be checked against a
real trade market after a few weeks of games.

After the first 4 to 6 games of the 2026-27 season, the trade values of a
real 12-team points league were compared, offline, with current trade values
from real leagues for 44 players: stars, centers, players off to starts far
from their draft rank, injured players and the low end of the scale. The
scale's shape matched (about 37 to 40 at the top, about 11 at the bottom;
ranks 50 / 100 / 150 at 22.9 / 15.8 / 12.9), but the order did not as much:
rank correlation 0.869, mean gap 2.50 points. Two patterns explained most of
the gaps:

- **The centers' discount was the right size on average but fell in the
  wrong places.** Centers sat 0.85 points below the market on average, but
  centers drafted after the 3rd round who score through rebounds sat 3 to 5
  points below it, while others sat above. The discount follows the draft
  rank and never fades with games, so a center drafted late keeps the whole
  cut however he plays. Without any discount centers sat 3.3 points above the
  market.
- **Five games moved values more than the market does.** Players drafted
  late and off to a hot start sat 3 to 6 points above the market; some
  players drafted early and off to a cold start sat 4 to 6 below it. The
  market still leans on where players were drafted. The draft market's
  weight (10) was already fading as 10 / (10 + games), to two thirds after 5
  games.

Options tested on the same players (correlation / mean gap):

| Settings                                   | Correlation | Mean gap |
| ------------------------------------------ | ----------- | -------- |
| before: C discount 0.35, market weight 10  | 0.869       | 2.50     |
| C discount 0.2                             | 0.891       | 2.45     |
| market weight 20                           | 0.889       | 2.38     |
| **C discount 0.2, market weight 20**       | **0.904**   | **2.18** |
| C discount 0.25, market weight 15          | 0.901       | 2.31     |
| C discount 0.2, market weight 25           | 0.914       | 2.15     |
| reputation lift for picks up to 60 (NFL's) | 0.841       | 2.71     |
| prior worth 20 games (instead of 10)       | 0.892       | 2.26     |

## Decision

- **Centers' discount: 0.35 → 0.2** (`positionMarket.C`), the value that
  also fits the draft market best (ADR 0022).
- **Draft market weight: 10 → 20, taken from expected points (40 → 30).**
  It keeps fading as 10 / (10 + games): about 13 after 5 games, 7 after 20
  and 4 after 40, so it matters early in the season and little after it.
- Weight 25 was slightly better on these players, but the gain over 20 is
  too small to trust with 44 players from one week.
- The reputation lift stays off for the NBA: it pulled the order away from
  the market. The prior's weight stays at 10 games: it also changes the
  points model, whose backtest prefers 10 (ADR 0022).

## Results

On the same league and players:

|                                     | Before             | After              |
| ----------------------------------- | ------------------ | ------------------ |
| Rank correlation                    | 0.869              | 0.904              |
| Mean gap                            | 2.50               | 2.18               |
| Centers, mean gap / mean abs. gap   | −0.85 / 2.45       | +0.32 / 2.25       |
| Other positions, mean abs. gap      | 2.54               | 2.14               |
| Players more than 4 points off      | 10                 | 9                  |
| Trade value at ranks 50 / 100 / 150 | 22.9 / 15.8 / 12.9 | 22.4 / 16.3 / 12.6 |

`npm run backtest:nba`: points per game do not change (trade value only).
Against the preseason draft market, the centers' table now reads 0.915 for
the 0.2 discount (0.908 for 0.35).

## Consequences

- Centers drafted after the first rounds are worth more in trades; the top
  centers barely move.
- Early in the season trade value leans more on the draft rank, so a few hot
  or cold games move it less. By mid-season the change has mostly faded.
- Players whose market value reflects the length of an injury or a role the
  data cannot see stay off the market; this change does not address them.
- Check again against a current trade market after two or three more weeks
  of games.
- The NFL does not change.
