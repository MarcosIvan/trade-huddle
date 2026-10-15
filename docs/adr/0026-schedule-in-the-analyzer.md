# ADR 0026: Bye week and schedule strength in the trade analyzer

- Status: accepted
- Date: 2026-10-15

## Context

When judging a trade, managers ask whether the players they receive have an
easier or harder road ahead than the ones they send: who is still to face
generous defenses, and who has a tough stretch in the fantasy playoffs. They
also want to see who still has a bye ahead.

The site already rates each defense by what it allowed to each position so
far (`defenseFactors`, ADR 0005), for the weekly lineup and the player card.

## Decision

- Each side's player table in the trade analyzer's result keeps trade value,
  points per game and the last games first, then adds:
  - **Bye**: the regular-season week the player's team has no game (NFL
    only; NBA teams have none). A bye already played is shown in gray.
  - **Regular schedule** and **Playoffs schedule**: the strength of the
    opponents left, for the regular season's remaining weeks and, apart, for
    the league's playoff weeks (Sleeper's `playoff_week_start`,
    `playoff_teams` and `playoff_round_type`). Without playoff settings every
    week left counts as regular season.
- Strength = the average factor of the opponents left for the player's
  position (the weekly lineup's `matchupShrinkGames`). The cell shows its
  rank among every team's schedule for that position ("4 of 32", 1 =
  easiest), colored like the recent-form column: green when the opponents
  allow at least 3% more than average, red when 3% fewer, gray otherwise.
  The tooltip gives the percentage, the good and tough games and the rank.
- Before the season's first games there is nothing to rate defenses by, so
  the cells show a dash.
- **Information only**: trade value, fairness, trade ideas, the finder and
  the leaders ignore it.
- Logic in `lib/model/schedule.ts` (`playerSchedules`, `byeWeeks`,
  `playoffWeeks`, `scheduleNote`); the columns live in `TradeSide`.

## Evidence

`npm run backtest:schedule`: after checkpoint N (NFL weeks 3-12, NBA
fantasy weeks 3-14; 2024 and 2025), does value × (1 + w × (opponents' factor
− 1)) predict each player's points per game afterwards better than his value
alone (same team only; w fitted on one season, judged on the other)?

| Sport | Players × checkpoints | Correlation (schedule effect, value's miss) | MAE value only | MAE with schedule |
| ----- | --------------------- | ------------------------------------------- | -------------- | ----------------- |
| NFL   | 2,486                 | −0.02                                       | 3.210          | 3.212             |
| NBA   | 1,593                 | 0.00                                        | 1.681          | 1.693             |

The result does not change with 2 to 32 games of average defense mixed in.
What a defense allowed in one half of a season barely predicts the other
half (by position, correlations from −0.2 to 0.35 in 2024). That is why the
schedule is shown as context, as a rank and a color, and is never turned
into points or into trade value.

## Consequences

- League settings now keep the playoff fields from Sleeper's league data.
- The analyzer's tables gain two or three columns; on narrow screens they
  scroll sideways like the other tables. The headers break into two lines to
  keep the columns narrow.
- A player traded mid-season is rated by his current team's schedule.
