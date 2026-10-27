# ADR 0027: Mid-season trade value recalibration

- Status: accepted
- Date: 2026-10-27
- Amends: ADR 0013 (scale shape), ADR 0023 (backup role)

## Context

The plan called for recalibrating trade value at mid-season (weeks 8-9).
After week 7, the product owner found players in shared backfields and
productive rookies valued well below what real trades pay for them.

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (197 players), as in ADRs
0010, 0013 and 0023. Rank correlation had slipped from 0.921 (before week 6)
to 0.911 (QB 0.898, RB 0.935, WR 0.935, TE 0.877). Three patterns explained
most of the gaps:

- **The backup role caught players who share a job.** A back behind the
  starters on the depth chart with under 35% of a lead back's usage over his
  last 2 games kept 60% of his value, even while scoring like a flex starter
  in a committee. Players with that role sat 4.5 points below the market on
  average.
- **Rookies stayed tied to their preseason projection.** For a rookie it is
  the only prior there is, and it runs conservative; it still weighed
  8 / (8 + games), 73% after 3 games. Rookies sat 2.6 points below the
  market on average.
- **Quarterbacks and tight ends at the low end were above the market** (by
  about 3.3 points): in one-quarterback leagues they are easy to replace,
  and the position scale gave them too much.

## Decision

- **Backup usage bar: 35% → 25%** of a lead player's usage (`roles.backupUsage`).
  A share of the backfield is no longer a backup's; deep backups with little
  usage still are.
- **A rookie's prior fades as 4 / (4 + games)** (`rookiePriorGames`, NFL only;
  0 keeps the sport's rule, as in the prototype and the NBA). It applies to
  players without games last season, in both their points and their trade
  value.
- **Position scarcity exponent: 0.6 → 1** (`scarcityPower`): positions whose
  elite players stand less far above replacement count for less.
- **Curve: 0.8 → 0.75** (`curve`): keeps the scale as even as before, since
  the scarcity change alone pulled the middle of the scale down by about a
  point.

## Results

On the same league and market:

|                                               | Before                        | After                         |
| --------------------------------------------- | ----------------------------- | ----------------------------- |
| Rank correlation (all)                        | 0.911                         | 0.922                         |
| QB / RB / WR / TE                             | 0.898 / 0.935 / 0.935 / 0.877 | 0.899 / 0.941 / 0.936 / 0.875 |
| Mean gap, in trade value at the market's rank | 2.54                          | 2.29                          |
| Players more than 5 points off                | 28                            | 21                            |
| Rookies, mean gap                             | −2.6                          | −1.8                          |
| Low-end QBs / TEs, mean gap                   | +3.3 / +3.3                   | +2.3 / +2.3                   |
| Trade value at ranks 50 / 100 / 150           | 25.3 / 18.6 / 14.0            | 24.6 / 18.9 / 14.2            |

The points backtest (`npm run backtest`, 2024 and 2025, half-PPR and PPR)
is unchanged overall with the rookie rule (MAE 3.290 both ways, rank 0.473
→ 0.472): a little worse after week 1 (3.15 → 3.16), a little better from
week 8 on (week 10: 3.50 → 3.47). Faster fades were worse early in the
season: 4 / (4 + games) is the fastest that does not cost accuracy overall
(2: 3.305; 3: 3.295; 6: 3.291).

The remaining backups the market lists are deep receivers with little
usage, valued on name and draft position.

## Alternatives considered

- **A backup keeps more of his value (0.8 or all of it) instead of a lower
  usage bar.** Similar correlation, but true deep backups would stay valued
  like starters, the problem ADR 0023 solved.
- **Ignoring games with no targets or carries** (special teams only). It
  fixes a rookie's early games on special teams, but drops real empty games
  of blocking tight ends and deep receivers: correlation fell (TE most).
- **A faster prior fade for everyone (6 or 5 games).** Small gain in the
  market comparison, but worse in the points backtest.
- **More weight on usage, recent form or the draft market.** No gain.

## Consequences

- Rookies' expected points, and so the weekly lineup, react sooner to their
  games.
- The NBA keeps its rules: `rookiePriorGames` is 0 there until a backtest
  says otherwise, and its scarcity exponent and curve are its own.
