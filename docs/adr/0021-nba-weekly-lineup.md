# ADR 0021: NBA weekly lineup: every game left, best game counts

- Status: accepted
- Date: 2026-10-08

## Context

The weekly lineup (ADR 0005) rates one game per player: the NFL plays once a
week. An NBA team plays two to four games in a fantasy week, and the stats
file keeps them by game day, each with Sleeper's projection and its opponent
(ADR 0019). The owner's league scores **lock-in** points: a player's week is
the one game his manager locks in (or his last one), not the sum of his
games.

## Decision

- **`weeklyOutlook` rates each game left this week**, the same way it rates
  the NFL's single game: value adjusted by what the opponent allows to the
  position, blended with Sleeper's projection for that game, times the
  chance of playing. Each player gets the list of his games (`games`). Game
  days already played this week are left out.
- **A week of several games counts the best one** (`multiGameWeeks` in the
  sport config, `bestGame` in `weeklyOutlook`). The best team of the week is
  built on each player's highest projected game. A player with four games no
  longer looks twice as good as one with two.
- **The table** shows each game left (`vs`/`@` and the opponent, with a
  compact Good / Neutral / Tough icon), two to a line. Then the trade value,
  and **High proj.**, the best game's projection. In the NFL, the columns stay
  Matchup and Proj., and the trade value column is added there too.
- **Player card:** each NBA row shows its date. The fantasy points column
  reads **FPts**, since "Pts" is a basketball stat. The header lists every
  position he can play.
- The benchmark key for fantasy points (`PTS_KEY`) is now `fantasy_pts`, so
  it no longer collides with the NBA's `pts` stat.

## Consequences

- Before the season, every matchup is neutral: no defense has allowed
  anything yet.
- The NFL lineup is the same: one game a week, whose best game is that game.
