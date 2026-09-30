# ADR 0010: Trade value calibrated against the market, with a reputation lift

- Status: accepted
- Date: 2026-09-30
- Amends: ADR 0007 (trade value weights and parts)

## Context

Early in the 2026 season, trade values in a real 12-team PPR league looked
unbalanced: star receivers were worth about the same as average running
backs, and running backs off to a hot start ranked far above their market
value. The last games seemed to weigh too much.

The recent games of the undervalued stars were not the cause: they scored
about what they were expected to. Three things held them down:

- their preseason projections were modest, and the draft market (ADP), often
  the only signal calling them stars, weighed 15 and was already down to about
  11 after 3 games;
- receivers were scaled 0.85 against running backs (1.0) by position
  scarcity;
- usage, 15 points measured over the last 4 games only, saturated for running
  backs: a share of 35% of the team's targets and carries already scored the
  maximum, so nearly every starting back got it while receivers got 0.6-0.9.

Tuning weights by hand could not lift the stars without also moving players
who were already valued well.

## Decision

**Calibrate against a market of real trade values.** The public redraft
trade values of FantasyCalc served as the reference. They are used **only
offline, for this calibration**: the site does not call FantasyCalc and the
daily build does not fetch it.

A search over the trade value's parameters minimized, on that league, the gap
in value points between each of the top 100 players (by market value) and the
value at his market rank. Season, last games and usage together were capped
at no more weight than before. The rounded result:

| Part     | Before | Now | Change                                                                                          |
| -------- | ------ | --- | ----------------------------------------------------------------------------------------------- |
| Expected | 15     | 30  | the backtested points model carries most of the value                                           |
| Scarcity | 10     | 25  | points above a free agent, relative to the league's best                                        |
| Usage    | 15     | 15  | a lead running back now takes 55% of targets + carries (was 35%), a lead receiver 20% (was 18%) |
| Season   | 10     | 10  |                                                                                                 |
| Market   | 15     | 10  | kept for preseason, when no games exist                                                         |
| Recent   | 10     | 5   | a smaller weight, not zero: form still counts                                                   |
| Base     | 15     | 5   | already inside Expected, which starts from the projection                                       |
| Edge     | 10     | —   | removed: the search gave it no weight                                                           |

- **Position scale**: `0.5 + 0.5 × ratio^0.6` instead of `0.5 + 0.5 × ratio`
  (`SCARCITY_POWER`), so positions sit closer together: receivers went from
  0.85 to about 0.92 in that league.
- **Reputation lift**: within each position, players are ranked by ADP. A star
  (ADP up to 60, not kickers or defenses) worth less than the value at his
  draft rank is lifted `8 / (8 + games)` of the gap (`REPUTATION_GAMES`): 73%
  after 3 games, half after 8. The target carries his own availability, so an
  injured star keeps his discount. Nobody is lowered by it. The trade value
  tooltip shows the lift.

## Results

Average gap to the market in the top 100, in value points: PPR 1.88 → 1.64
(the format fitted), and in formats not used for the fit, half PPR
2.11 → 1.72, standard 2.64 → 2.18, PPR superflex 2.25 → 1.84. The rank
correlation with the market rose in every format (PPR 0.925 → 0.938).

## Consequences

- Stars off to a slow start keep most of their value early and lose the lift
  as the season goes on; hot starts count less.
- Mid-roster players rise 1-2 points; their order holds.
- The calibration used one league and one week. It should be repeated at mid
  season; the market values then must be fetched again by hand.
- The prototype reference tests do not use trade value and are unchanged.
