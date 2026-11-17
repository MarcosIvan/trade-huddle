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
  around the league's average weekly score so far times its strength that
  week over the league's average strength across the weeks left. The spread is the
  pooled standard deviation of each team's weekly scores around its own
  average (18% of the average until 3 weeks have scores).
- **Standings**: wins (ties count half) then points for, Sleeper's default
  tiebreaker. With "league average match", each week also counts a game
  against the week's median. Division winners are not seeded apart.
- **Strength in each week left** (`model/weekStrength.ts`): the best
  lineup in each of the week's periods, from the players whose team plays
  then, added up. In the NFL a player on a bye sits that week out and the
  bench fills in; in the NBA a week is several game days, so a roster with
  more games that week is stronger. The average is taken over every team
  and week left, so a week with many byes lowers the teams that lose
  players, not everyone. A week the stats file has no schedule for falls
  back to the best lineup today for every team.
- **Injuries by the week**: in the lineup week a player counts by his
  chance to play it (the sport's `weekAvailability`: out 0, questionable
  85% in the NFL); after that, a game-to-game injury (out, doubtful,
  questionable) is behind him and he counts at full value, and a long one
  (IR, PUP) counts at the model's value, which already leaves out the share
  of the season he is expected to miss. A season-ending injury or no team
  counts nothing.
- **Points so far**: half of a team's strength comes from its lineup and
  half from its points per week so far, each as a share of the league's
  average (`ACTUAL_WEIGHT`), applied to its strength in every week left so
  byes still count. The lineup misses what the model does not see (who
  manages the team, who breaks out); the points so far catch some of it.
- **Strength may be off**: once per simulated season each team's strength
  is multiplied by a draw around 1 with a 20% standard deviation
  (`STRENGTH_SPREAD`), for what neither sees.
- **Checked on a past season** (the league's previous season on Sleeper,
  odds after each of weeks 4 to 13 against who made the playoffs; a rough
  strength from each player's average so far, as there is no history of
  the model). Without the spread the odds were too sure: several 90%+
  calls went wrong. The error fell as the spread grew up to about 20-25%,
  and blending in the points so far lowered it a little more. The records
  alone still did better until about week 9, and the lineup helped only
  late: one season is a small sample, so the weights are to be checked
  again as seasons end.
- **Byes**: as many as fill the bracket to the next power of two (6 playoff
  teams: the top 2 seeds).
- **Order**: teams are listed in today's standings, by the same rule, with
  their place in a `#` column; projected record and odds stay on each
  team's row, so they need not be in order themselves. The odds answer
  "where can this team end up", which reads best next to where it is now.
- 10,000 seasons with a fixed seed, so the same data always gives the same
  odds. The projected record is shown in whole games (wins rounded, losses
  the rest).

The matchups are fetched once per league (`useLeagueMatchups`) and shared
with the league trade report. The table is hidden in the demo, after the
regular season and when Sleeper fails.

## Alternatives considered

- **Weekly projections per player** (injuries week by week): more
  precise for the next week or two, but the stats file only holds the
  current week's projections. Byes and game counts come from the schedule
  instead; injuries count as they are today.
- **The team's own season average**: it repeats past luck; the best lineup
  today reflects trades, injuries and the model's view of each player.

## Consequences

- Odds move with trades and injuries as soon as rosters are refreshed.
- The table is information: it does not change trade ideas.
