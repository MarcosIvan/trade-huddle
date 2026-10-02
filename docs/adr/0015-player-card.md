# ADR 0015: Player card with the season week by week and every matchup rated

- Status: accepted
- Date: 2026-10-02

## Context

The product owner asked for a player card like Sleeper's: click a player
and see his scoring (rushing and receiving) and his upcoming games, with
each matchup marked as easy, neutral or hard.

## Decision

- **Everything comes from the stats file the site already loads.** It has
  each week's stat line (`w`), the team the player played for (`tw`) and the
  whole regular-season schedule. No new request and no pipeline change.
- **One table for the whole season.** Each row is a week: opponent (`vs`
  at home, `@` away, or Bye), matchup, fantasy points under the league's
  scoring, and the stat columns. Weeks still to play keep their points and
  stat cells empty, and a total row closes the table. The week under way
  counts as played only for players whose game is over.
- **Columns per sport and position** (`SportConfig.gameLog`): rushing and
  receiving for RB, WR and TE (receiving first for WR and TE), passing and
  rushing for QB. Kickers and defenses show points only. The NBA can declare
  its own groups.
- **Matchups use the weekly lineup's measure** (`defenseFactors`, ADR 0005):
  what each defense has allowed to the position this season, per game,
  against the league average, shrunk toward average by
  `matchupShrinkGames`. Easy means 8% or more above average, hard 8% or more
  below (`MATCHUP_EDGE`, `matchupLevel`), the same cut the weekly lineup
  already used for good and tough. Past games are rated with the season's
  numbers so far, which include that game. A defense with no data shows a
  dash.
- **Every number is colored** against what the position usually does per
  game (`statBenchmarks`): green when 15% or more above, light red when 15%
  or more below, yellow in between (`STAT_EDGE`, `statLevel`). Fantasy points
  are colored the same way. For interceptions fewer is better
  (`lowerIsBetter`), so a zero is green. For stats under one a game (like
  touchdowns), and for the position's second group (a receiver's rushing),
  a zero is yellow, not red. Cells with nothing in them (weeks to come) are
  gray, and a past week without a game reads "Did not play" across the row.
  The color is not the only signal: each cell's level is also given in words
  to screen readers, and the tooltip has the average.
- **The average comes from a large sample.** The group is twice the league's
  starters at the position (`BENCHMARK_DEPTH`, the line from
  `starterLine`: 24 QBs in a 12-team league), and the average runs over
  this season's games and last season's. Starters alone, this season only,
  gave about 40 games for QB and TE after four weeks, picked by a value that
  already rewards hot starts. The wider sample gives a few hundred games.
  The owner chose it to try; if it shows too much green, the fallback is
  starters only, still with last season.
- **Each stat group is set apart** by a divider in the text color, and the
  group title is centered between its dividers.
- **Sleeper has no per-stat reference.** Its weekly stats carry a positional
  rank for fantasy points (`pos_rank_*`, in standard, half and full PPR
  only), which the pipeline drops. The app's own cell colors are not exposed.
- **Where names open it:** the team and weekly lineups, the trade idea and
  trade finder cards and the analyzer's result tables. Names in the
  analyzer's pick lists stay plain, since clicking them picks the player.
  It works in the demo league too.

## Consequences

- Early in the season the ratings rest on few games and can move from week
  to week. The shrink keeps them closer to neutral until there is data.
- Byes come from the schedule: a week where the team has no game is a bye.
