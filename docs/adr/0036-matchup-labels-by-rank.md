# ADR 0036: Matchup labels by rank

- Status: accepted
- Date: 2026-11-12
- Amends: ADR 0015 (player card matchups), ADR 0034 (matchup labels)

## Context

ADR 0034 made each defense's points-allowed factor steadier: it now mixes in
32 games of an average defense in the NFL (8 for team defenses) and 64 in
the NBA, because what a defense allowed so far is mostly noise. The labels
kept their cut: good at 8% or more above average, tough at 8% or more below.

With steadier factors, the defenses of a position now span about ±6% in the
NFL, so almost nothing reached the cut. In the product owner's league, the
week's games of relevant players went from 108 good and 100 tough to 12 and
11, and most of those were team defenses (whose factors still spread
widely). The product owner found the labels broken: every matchup read
Neutral whatever the opponent.

## Decision

A matchup's label comes from the defense's rank for the position
(`matchupRatings` in `model/matchup.ts`), not from a fixed percentage:

- Every defense is ranked by its factor for each position, 1 = allows the
  most (the easiest).
- **Good**: among the easiest quarter (8 of 32 in the NFL, 8 of 30 in the
  NBA, `MATCHUP_SHARE`) and allowing more than average.
- **Tough**: among the hardest quarter and allowing fewer than average.
- Neutral otherwise. Defenses with the same factor share a place, so before
  any game is played (every defense average) nothing is labeled.
- The tooltip gives both the rank and the percentage: "BUF is the 6th
  easiest defense of 32 for RBs (allows 4% more points than average)".

The weekly lineup, the player card and the analyzer's good / tough game
counts all use the same ratings. The analyzer's schedule columns keep their
own rank and 3% color cut (ADR 0026). Points, values and lineups do not
change: the label is information.

## Alternatives considered

- **A lower cut (±3%).** 78 good and 70 tough in the same week, but it
  depends on the shrink chosen, and team defenses, whose factors spread far
  more, would be labeled almost every week while players rarely were.
- **Keeping ±8%** (ADR 0034): honest about how small the differences are,
  but the labels stop telling one opponent from another.

## Consequences

- About a quarter of the games are good and a quarter tough, for every
  position and sport (in the product owner's league this week: 99 good, 189
  neutral, 91 tough; in the NBA 216, 401 and 223).
- A good label means "among the easiest opponents for this position", not
  a large edge in points; the percentage in the tooltip says how large.
