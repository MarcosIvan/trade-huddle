# ADR 0031: Even trades count every player in full

- Status: accepted
- Date: 2026-11-01
- Amends: ADR 0013 (trade sides)

## Context

ADR 0013 weighs a side's players by `SIDE_DEPTH` (`[1, 0.55, 0.4]`, best
first): the best player counts in full, the second 55% and the third 40%, so
two good players do not add up to a star. The weights were fitted on 2-for-1,
3-for-2 and 3-for-1 trades, but they applied to every trade, including those
with as many players on each side.

In a 2-for-2 or 3-for-3 trade nobody frees or fills a roster spot: each
player sent is replaced by one received. The discount there only shrinks the
lesser players on both sides and hides the real gap. With fictional values,
30 + 20 for 25 + 25 is an even trade (50 for 50) but read 41 for 38.75; and
the depth player in a star-plus-depth package was worth 55% of what he is
worth on his own.

## Decision

- **Same number of players on each side: a plain sum.** Every player counts
  with 100% of his trade value (`tradeSides`).
- **Uneven trades (2-for-1, 3-for-2, 3-for-1) keep `SIDE_DEPTH` on both
  sides**, as before: there the side with more players uses an extra roster
  spot, and two good players still do not add up to a star.
- One-for-one trades do not change (one player per side counts in full
  either way).
- The same rule feeds the fairness meter, the trade analyzer's "trade value"
  change, the trade finder, trade ideas and the filter that skips trades too
  far apart before evaluating them, in both sports.

## Consequences

- 2-for-2 trades read closer to the sum of their trade values: the lesser
  player on each side now matters as much as he is worth.
- A star and a depth player for two solid players needs a better depth
  player than before to be fair: the second solid player now counts in full,
  and the star's edge over the better one no longer stretches with the
  discount. With fictional values, a 26 star for two 20s needed a depth
  player worth about 9; now about 14.
- The idea shape thresholds (`IDEA_DEPTH_SHARE`, `STAR_EDGE`) and the
  fairness thresholds stay as they are.
