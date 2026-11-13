# ADR 0041: Playoff odds

- Status: accepted
- Date: 2026-11-13

## Context

Managers decide trades by where they stand: a team sure of the playoffs
plays for the playoff weeks, a team on the bubble for the next games. The
site showed records, not chances.

## Decision

A **Playoff odds** table, at the end of the team view beside the position
needs, gives every team's record, projected record and chances of making
the playoffs and of a first-round bye (`model/playoffs.ts`):

- **Schedule**: Sleeper's matchups for every regular season week
  (`/league/<id>/matchups/<week>`); Sleeper sets the pairings for the whole
  regular season in advance. Weeks after `last_scored_leg` are simulated,
  the week under way included (from scratch).
- **Scores**: a team's weekly score is drawn from a normal distribution
  around the league's average weekly score so far times its best lineup's
  points per game over the league's average lineup. The spread is the
  pooled standard deviation of each team's weekly scores around its own
  average (18% of the average until 3 weeks have scores).
- **Standings**: wins (ties count half) then points for, Sleeper's default
  tiebreaker. With "league average match", each week also counts a game
  against the week's median. Division winners are not seeded apart.
- **Byes**: as many as fill the bracket to the next power of two (6 playoff
  teams: the top 2 seeds).
- 10,000 seasons with a fixed seed, so the same data always gives the same
  odds. The projected record is shown in whole games (wins rounded, losses
  the rest).

The matchups are fetched once per league (`useLeagueMatchups`) and shared
with the league trade report. The table is hidden in the demo, after the
regular season and when Sleeper fails.

## Alternatives considered

- **Weekly projections per player** (byes, injuries week by week): more
  precise for the next week or two, but the stats file only holds the
  current week's projections.
- **The team's own season average**: it repeats past luck; the best lineup
  today reflects trades, injuries and the model's view of each player.

## Consequences

- Odds move with trades and injuries as soon as rosters are refreshed.
- The table is information: it does not change trade ideas.
