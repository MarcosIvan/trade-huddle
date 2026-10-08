# ADR 0020: NBA model, and the sport chosen by the league

- Status: accepted
- Date: 2026-10-08

## Context

ADR 0019 added a daily NBA stats file, kept by game day. To open NBA leagues,
the site also needs an NBA model (positions, slots, injuries, trade value).
The whole page must also stop assuming the NFL. The model, the trade search
worker, the lineups, the analyzer and the player badges all read the NFL
config directly.

## Decision

**The sport comes from the league.** Sleeper's league object says its sport.
`sportOf` (`lib/sports/index.ts`) maps it to a `SportConfig`, with the NFL
when the field is missing. The league screen puts it in a `SportContext`, and
every component reads it from there. The trade search request carries the
sport's id to the worker. The site loads `data/<sport>/stats.json` after
fetching the league, and NBA leagues are enabled in the league picker.

**Periods** (`lib/model/periods.ts`). A stats file's entries are weeks (NFL)
or game days (NBA). `weekPeriods`, `lineupPeriods` and `currentPeriod` give
the periods of a fantasy week, so the next game's projection and the player
card work in both sports. On an NBA card, a day the team does not play is no
row at all, not a bye.

**Per-game projections.** Sleeper's NBA preseason projections are per-game
averages, not season totals, so the stats file says so (`proj_per_game`).

**Trade value per sport** (`SportConfig.tradeValue`). The weights, the curve
and the other trade value constants moved out of `score.ts` into the sport
config. The NFL's values are unchanged. The NBA's (`lib/sports/nba.ts`):

- The same recipe, without the usage measure (there are no targets or
  carries in basketball). Its weight goes to expected points (40) and
  scarcity (30).
- The last **12 games** as recent form, about the NFL's last 3 in share of
  the season (15% against 18%) and in calendar time. The prior's weight is
  38 / (38 + games), the NFL's 8 games scaled to an 82-game season.
- No reputation lift. Before a game is played it would lift every early pick
  to the value of his draft rank, and the draft market already counts.
- Scarcity follows each position's edge over a free agent linearly
  (`scarcityPower` 1). The draft market's measure is one half at pick 30.
- A market discount by position (`positionMarket`): centers lose up to 35% of
  their value, times how little the draft market rates them. So the discount
  fades for centers drafted early.
- The trade value curve stays at 0.8 in both sports, because the trade shape
  rules (`IDEA_DEPTH_SHARE`, `STAR_EDGE`) are derived from it.

**NBA config.**
- Positions: PG, SG, SF, PF and C. Slots G (PG/SG), F (SF/PF) and UTIL (any).
- Injuries: IR, Sus and NA keep half the value and can't start; Out keeps 90%.
  Chances of playing in a game: GTD 60%, DTD 75%.
- The player card's box score: points, rebounds, assists, steals, blocks,
  threes and turnovers.

**Interface.**
- Player badges show every position a player can play, not only his main one.
- The Player Score pill next to names is gone from the team list too.
- The page grows to 1440 px, so names with three positions fit on one line.

## Consequences

- Until the weekly lineup groups game days (next step), an NBA league shows
  the season lineup by value instead of this week's lineup.
- The NFL's model, values and screens are unchanged: the same unit and
  end-to-end tests pass, and the NFL's trade value hint reads as before.
- A fictional NBA league in the end-to-end tests opens with the NBA's slots,
  multi-position badges, trade ideas and the player card.
