# ADR 0019: NBA stats kept by game day

- Status: accepted
- Date: 2026-10-08

## Context

The site is expanding to Sleeper's NBA leagues. Sleeper's NBA leagues are
mostly points leagues like the NFL's. The owner's league scores points,
rebounds, assists, steals, blocks, turnovers, threes, double- and
triple-doubles and a few bonuses. Its lineup has PG, SG, G, SF, PF, F, C and
two UTIL slots.

The NFL stats file keeps one entry per week, because an NFL team plays once a
week. An NBA team plays two to four games in a fantasy week. Sleeper's NBA
endpoints answer by week, with **one line per game** and its date: the stats,
the weekly projections (each with its opponent) and the schedule, whose
teams come as `{ "team": ... }` objects. A team plays at most once a day.
The 2025-26 regular season had 166 game days over 25 fantasy weeks.

The model works game by game: points per game, recent form, games played.
Summing an NBA week into one entry would mix up a 4-game week and a 2-game
week.

## Decision

- **A sport says what one entry is** (`SportConfig.period`): a `week` for
  the NFL, a game `day` for the NBA.
- **Day numbers count calendar days** from the first date on the schedule,
  so the gaps between days (back-to-backs, rest, the All-Star break) are
  kept. `day_weeks` maps each day to its fantasy week, and `day_dates` maps
  it to its date.
- In the NBA file, `weeks`, `w`, `tw`, `wp` and `schedule` are keyed by
  **day**. The field names stay the same, so the model can treat both
  sports as a list of periods. `lineup_week` is still the fantasy week.
- **`wp` holds one projection per game** of the lineup week. Each one
  already accounts for its opponent, and the best team of the week will add
  up its games.
- **Postponed and canceled games** are left out of the schedule and never
  hold the lineup week open (this applies to the NFL too).
- **Stats kept:** everything a points league can score (pts, reb, ast, stl,
  blk, to, tpm, the made and missed shots, dd, td, bonuses, fouls), plus time
  on court (`sp`) for the player's role. Quarter and half splits, combined
  stats (`pts_reb`…), plus-minus, ranks and the precomputed `pts_std` are
  dropped. The NBA has no usage totals.
- **ADP:** Sleeper's standard NBA ADP (`adp_std`, up to pick 200) is kept,
  as the NFL keeps its ADPs for the market prior (ADR 0003).
- **Daily build:** the deploy builds the NBA file after the NFL's. If
  Sleeper's NBA data fails, the published NBA file is kept for another day,
  so the NBA never holds up the NFL.

## Consequences

- At the end of a season the NBA file is about 3 MB (0.8 MB gzipped, as
  GitHub Pages serves it), against about 0.5 MB for the NFL. A whole past
  season with every week's projections, used only for backtests, is about
  7 MB.
- The site's model and screens still read `weeks` as weeks. Making them read
  periods (and group game days into weeks for the weekly lineup) is the next
  step of the NBA work.
