# ADR 0035: Trade value closer to the market: shorter reputation, players out

- Status: accepted
- Date: 2026-11-12
- Amends: ADR 0007 (availability of injured players), ADR 0010 (reputation lift)

## Context

After week 9 the product owner found players valued above others who score
less and are projected lower, and asked to bring trade value closer to the
market without hurting other players.

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (196 players), as in ADRs
0010, 0013, 0023, 0027, 0028 and 0032. Two groups sat above the market:

- **Players out this week.** Players listed Out or Doubtful sat about 3
  points above it on average (8 of the 9 above). Their trade availability
  came from the injury rule: `1 − (1 − injuryRecovery) × (1 − mult)`, 0.94
  for Out and 0.97 for Doubtful. Trade markets discount them more.
- **Drafted stars in a slump.** Players lifted by ADR 0010's reputation
  lift sat about 1 point above it, the biggest gaps 4 to 5.5. They score
  less than their draft rank, and after 6 to 9 games the lift
  (`8 / (8 + games)` of the gap) still closed about half of it. The market
  no longer pays that much for draft position.

## Decision

- `reputationGames` goes from 8 to 3 (NFL): the lift closes `3 / (3 + games)`
  of the gap, half after 3 games and a quarter after 9.
- A new trade value parameter, `injuryAvailability`, sets the trade
  availability of some injury statuses in place of the injury rule's: Out
  0.88 and Doubtful 0.92 in the NFL. IR, PUP and the others keep the rule.
  It is trade value only: points per game, lineups and trade ideas keep
  the injury rule (`model.injury`), which the backtest calibrated.
- The NBA keeps its values: it has no reputation lift, and its
  `injuryAvailability` is empty (Out and Doubtful there are game to game).

## Results

|                                                 | Before                        | After                         |
| ----------------------------------------------- | ----------------------------- | ----------------------------- |
| Rank correlation (all)                          | 0.925                         | 0.928                         |
| QB / RB / WR / TE                               | 0.895 / 0.932 / 0.934 / 0.954 | 0.908 / 0.932 / 0.937 / 0.951 |
| Top 24 QB / 48 RB / 60 WR / 24 TE               | 0.941 / 0.941 / 0.920 / 0.969 | 0.941 / 0.944 / 0.926 / 0.966 |
| Mean gap, in trade value at the market's rank   | 2.29                          | 2.17                          |
| Mean gap, market's top 50                       | 1.56                          | 1.35                          |
| Mean gap of players out or doubtful (9)         | +2.99                         | +1.78                         |
| Mean gap of players with a reputation lift (27) | +0.97                         | +0.37                         |

Of 1056 players, 30 moved by half a point or more and 13 by more than a
point, all down (the largest −2.4): 19 through the reputation lift and 11
out or doubtful. Of the 25 movers the market lists, 21 moved closer to it
and none moved more than a point further away. Four moved slightly further,
all already below the market: a rookie on injured reserve (−3.3 → −4.1), a
back out this week after a minor surgery the market expects him back from
soon (−4.7 → −5.7) and two others by 0.1 to 0.7. The scale barely moves
(the 25th, 50th and 100th values: 29.8 → 29.5, 25.7 → 25.3, 19.3 → 18.8).

NBA trade values are unchanged (664 players checked). The points backtest
(`npm run backtest`) is unchanged (MAE 3.290, rank 0.472): it does not read
trade value parameters.

The reputation lift can only be checked against this season's market at
mid-season: early in a season the shorter lift lets a drafted star's slow
start count sooner (after 3 games he keeps half of the lift instead of
73%). The earlier mid-season checks (ADR 0027 and the following weeks)
found the same group above the market.

## Alternatives considered

- **Reputation 2, 4 or 0.** 4 is cleaner but gains less (mean gap 2.23).
  2 gains a little more (2.18 alone) but pushes the injured rookie above
  further from the market. With no lift at all, two players move more than
  a point away from the market.
- **The lift shorter for running backs only.** Weaker (mean gap 2.24): the
  receivers in the group sat as far above the market.
- **Lowering Out and Doubtful in the injury rule** (`model.injury`). It
  moves points per game, lineups and trade ideas too, which the backtest
  calibrated: kept to trade value.
- **Out 0.85 / Doubtful 0.90, or lower.** 0.85 brings 11 players more than
  a point closer (8 with 0.88) but moves the back expected back soon about
  1.5 further away; below that, more players out for a week drop under the
  market.
- **A lower `injuryRecovery`.** It also hits injured reserve, where the
  market already pays more than the model for players coming back.
- **Less weight on the draft market** (ADP 10 → 5 or 0). Almost no change:
  it already fades with games played.
- **The lift only for the top 36 picks.** Worse: it drops stars whose
  values already sat below the market.
