# ADR 0033: Extra players in an uneven trade count 30%

- Status: accepted
- Date: 2026-11-04
- Amends: ADR 0013 (side weights), ADR 0031 (uneven trades)

## Context

Since ADR 0031, even trades are a plain sum and uneven trades (2-for-1,
3-for-2, 3-for-1) weigh each side by `SIDE_DEPTH` (`[1, 0.55, 0.4]`, best
first). In real trades in the owner's leagues the discount was too mild,
in both sports:

- a 1-for-2 that managers had just agreed on (one player for two of about
  his value) read red (70%), while it was even or close to it;
- a 1-for-2 offer that the receiving manager would never accept (a starter
  for two lesser players) read green (97%).

A current trade market showed the same thing: the single better player was
worth well more than the 55% weight gives the second player of the pair.

Two ways to fix it were weighed:

- **A. The extra player counts 30%.**
- **B. The team that gets more players drops its lowest-valued one**, which
  is added to the trade going the other way, and the now-even trade is a
  plain sum.

On the same two trades, A read 83% and 82% (both yellow); B read 70% and
91%: the agreed trade stayed red and the offer the manager would reject
stayed green. B also counts the
dropped player at his full trade value, which never goes below 1 and keeps
lesser players close to the top of the scale (a team's lowest-valued player
is still worth about a fifth of the best player in the league), while a free
agent would take his spot for almost nothing. And it makes the same trade
read differently depending on who is on the receiving roster, while a player
must be worth the same on both sides of a trade. The roster spot itself is
already measured where it matters: the lineup impact fills it with the best
free agent available (ADR 0006).

## Decision

- **Players are paired across the trade.** On each side, sorted by trade
  value, as many players as the smaller side sends count in full.
- **The extra players** (the bigger side's lesser ones, beyond that count)
  count `EXTRA_PLAYER_WEIGHT` = **30%** of their trade value.
- The smaller side is never discounted (before, in a 3-for-2 its second
  player counted 55%).
- Even trades do not change: nobody is extra, a plain sum (ADR 0031).
- `SIDE_DEPTH` and `sideValue` are removed; `tradeSides` holds the rule.
- The same rule feeds the fairness meter and the trade analyzer's "trade
  value" change, in both sports. Trade ideas and the trade finder only
  build even trades (ADR 0014, ADR 0025), so they do not change; neither do
  the idea shape thresholds (`IDEA_DEPTH_SHARE`, `STAR_EDGE`), which apply to
  2-for-2 deals.
- The fairness thresholds stay (green 90%, yellow 75%).

## Consequences

With fictional trade values:

| Trade                    | Before (`SIDE_DEPTH`)   | Now (extra 30%)          |
| ------------------------ | ----------------------- | ------------------------ |
| 26 for 24 + 12           | 30.6, 85% yellow        | 27.6, 94% green          |
| 24 for 15 + 14           | 22.7, 95% green         | 19.2, 80% yellow         |
| 36 for 15 + 15 + 15      | 29.3, 81% yellow        | 24.0, 67% red            |
| 30 + 20 + 10 for 35 + 25 | 45.0 vs 48.8, 92% green | 53.0 vs 60.0, 88% yellow |

- A star for two players is fair only when one of the two is close to the
  star: quantity no longer makes up for quality.
- Turning a star into three solid players reads clearly against the side
  with three, as managers judge it.
- In a 3-for-2, the two best players of each side face each other in full,
  and only the third player is discounted.
- 30% was picked over a deeper cut. About 19% would have made the agreed
  trade green, and below that the rejected offer red, but extra players
  would be close to worthless; and most of what still keeps the agreed trade
  yellow is how the single player is valued against the two, a matter for
  the trade value itself, not for this weight.
