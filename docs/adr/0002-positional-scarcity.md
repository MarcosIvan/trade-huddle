# ADR 0002: Trade value as the headline number, with bench depth for scarcity

- Status: accepted
- Date: 2026-09-28

## Context

The site showed expected points per game as each player's "Value". A
quarterback scoring 24.6 points per game appeared above a running back
scoring 23.1, although in a one-quarterback league good quarterbacks sit in
free agency and good running backs do not. In drafts the running back goes
2nd overall and the quarterback after pick 120.

The model already measured scarcity with value over replacement (the points a
player scores above the best free agents at his position), and trade balance
already used it. Two things were missing: that number was not the one on
screen, and replacement level assumed teams roster only their starters, so
positions that leagues hoard on benches (running backs above all) looked less
scarce than they are.

## Decision

1. **Trade value is the headline number** everywhere (lineup, trade ideas,
   analyzer). Points per game stays visible as a secondary column.
2. **Bench depth per position.** Before replacement level is measured, each
   team also keeps a number of bench players per position:
   QB 0, RB 1, WR 1, TE 0.25 per team.
3. **Calibrated against the draft market.** Sleeper publishes preseason
   projections and ADP (average draft position); the pipeline now stores
   both. Preseason, every player's expected points are his projection, so how
   trade value orders different positions depends only on scarcity. A search
   over 672 depth combinations (`npm run backtest:scarcity`) measured how well
   preseason trade value ranks the top 150 picks against ADP in 2024, 2025 and
   2026, half-PPR and PPR.

| Bench depth per team | Correlation with ADP | RBs in our top 36 |
|---|---|---|
| none | 0.842 | 16-17 |
| QB 0, RB 0.5, WR 1, TE 0.25 (best fit) | 0.885 | 14-17 |
| **QB 0, RB 1, WR 1, TE 0.25 (chosen)** | **0.876** | **20-21** |

The best statistical fit and the chosen setting are close. The product owner
chose the setting that leans toward running backs: scarcity in fantasy is
about players who score well at a position, and elite running backs are the
scarcest of those. The market's own top 36 varies by year (12 to 17 running
backs), so both settings are within what drafts show.

Market data and the trade value agree on the known exceptions: elite
quarterbacks and tight ends (Josh Allen, Trey McBride, Brock Bowers) still
rank high, and tight ends stay slightly above quarterbacks as a group.

## Evidence on predictions

Bench depth changes replacement level, which also sets where rookies and
players without a track record start. The rest-of-season backtest
(ADR 0001) improves with it:

| Model | MAE (pts/game) | Rank correlation |
|---|---|---|
| Prototype | 4.26 | 0.28 |
| ADR 0001 calibration | 4.02 | 0.31 |
| **+ bench depth** | **3.88** | **0.36** |

## Consequences

- In a real one-quarterback league after week 3 of 2026: Bijan Robinson ranks
  3rd overall by trade value, Brock Purdy 30th; 13 of the top 24 are running
  backs.
- Replacement level is still simulated from the whole player pool. Using the
  league's actual free agents is a separate change (it also lets the site name
  the free agent to pick up after an uneven trade).
- Superflex and 2-QB leagues get quarterback scarcity from their extra
  quarterback slots, not from bench depth.
