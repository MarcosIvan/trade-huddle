# ADR 0037: Matchup labels in five levels

- Status: accepted
- Date: 2026-11-12
- Amends: ADR 0036 (matchup labels by rank), ADR 0026 (schedule colors)

## Context

ADR 0036 labeled a matchup by the defense's rank for the position: the
easiest quarter good, the hardest quarter tough, the middle half neutral.
Half the games read Neutral, and a good matchup against the easiest defense
in the league looked the same as one against the eighth easiest.

The analyzer's schedule columns ("N of 32") were colored by their own rule,
a 3% cut on the average opponent factor (ADR 0026), so the same green or
red meant different things in the schedule and in the matchup badges.

## Decision

A matchup's label has five levels, from the defense's rank for the position
(`rankLevel` in `model/matchup.ts`):

- **Great** (▲▲, the darkest green): among the easiest fifth (6 of 32,
  `MATCHUP_STRONG_SHARE`) and allowing more than average.
- **Good** (▲, a lighter green): the next ones, down to 13 of 32
  (`MATCHUP_SHARE`), allowing more than average.
- **Neutral** (●, gray): the middle fifth, and any defense on the wrong
  side of average.
- **Tough** (▼, a lighter red) and **Brutal** (▼▼, the darkest red): the same,
  mirrored, for defenses allowing fewer than average.

Defenses with the same factor still share a place, so before any game is
played nothing is labeled. The tooltip is unchanged (rank and percentage).

The analyzer's schedule columns use the same rule on the schedule's place
among every team's schedule for the position, and show the rank in the same
five colors (`MatchupTone`); the 3% cut (`SCHEDULE_EDGE`) is gone. The good /
tough game counts in the schedule tooltip count great with good and
brutal with tough.

Points, values, lineups and fairness do not change: the labels are
information.

## Alternatives considered

- **Keeping three levels** (ADR 0036): half the games neutral, and no way to
  tell the very easiest opponents from merely easy ones.
- **Equal fifths** (6-7 per level): the outer levels would be the same size
  as the inner ones; keeping the strong colors for the ends makes them stand
  out as the rare cases.

- **"Quite good" / "Quite tough"** as names: two words where the others
  have one, and "quite" can read as "somewhat", weaker than intended.
  "Very good" / "Very tough" were clear but long; "Smash" / "Avoid" read as
  advice, while the labels are information only.

## Consequences

- About a fifth of the games are neutral; the rest split between the two
  greens and the two reds.
- The badge is bold text in the level's color, with no background, as in
  Sleeper: the darkest green and red mark the ends (`--match-*` tokens). In
  the dark theme "darkest" means the most saturated, with paler shades for
  good and tough. Every color passes the contrast test in both themes.
- The schedule columns and the badges now read the same: the darkest green
  in either means among the easiest fifth.
