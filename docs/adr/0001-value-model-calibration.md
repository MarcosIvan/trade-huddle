# ADR 0001: Calibrate the value model with a backtest

- Status: accepted
- Date: 2026-09-28

## Context

The prototype's value model blended last season, this season and the last
three games with hand-picked weights. Checked against a real league after
week 3 of 2026, it overreacted to three games: one 40-point game was enough
to rank a receiver well above peers with the same track record and more
volume, and a player with no NFL team kept last season's value.

Tuning the weights until a few familiar names "look right" would only move
the problem. We needed a way to measure the model.

## Decision

1. **Measure with a backtest.** The pipeline can now build any past season in
   full (`python -m trade_huddle_data build --season 2025`). The backtest
   (`npm run backtest` in `web/`) lets the model see only weeks 1..N of a
   season, predicts every player's points per game, and compares with what
   each player actually averaged in the rest of that season (at least four
   games). It covers 2024 and 2025, half-PPR and PPR scoring, and
   checkpoints after weeks 1, 2, 3, 4, 6, 8, 10 and 12. Metrics: mean
   absolute error in points per game, and rank correlation inside each
   position, over the players who matter (the top of each position by
   prediction or by outcome).

2. **Change the model where the evidence supports it:**
   - Last season fades by reliability, `3 / (3 + games)`, instead of losing
     8 points per game: 75% after one game, 50% after three, 27% after eight.
   - The last-three-games average only counts once more than three games have
     been played (before that it is the same games as the season average).
     Its share of the current-season weight drops from 55% to 30%.
   - **Usage:** for RBs, WRs and TEs, half of each game's points is replaced by
     what its targets, carries and red-zone targets usually produce. What an
     opportunity is worth is fitted each time, per position, from this
     season's games under the league's own scoring, so it adapts to PPR,
     half-PPR, TE premium and so on. The displayed averages stay the real ones.
   - Players **without an NFL team** keep 25% of their value (someone may sign
     them) and are never started. This one cannot be backtested (past seasons
     do not say who was unsigned at the time); it is a product rule.

3. **Keep the prototype's settings** as `PROTOTYPE_MODEL` so the reference
   tests keep proving the TypeScript port matches the prototype.

## Evidence

Average over both seasons, both scoring systems and all checkpoints
(lower MAE is better, higher rank is better):

| Model | MAE (pts/game) | Rank correlation |
|---|---|---|
| Only last season | 4.55 | 0.21 |
| Only this season | 4.71 | 0.23 |
| Prototype | 4.26 | 0.28 |
| **Calibrated** | **4.02** | **0.31** |

By checkpoint (MAE / rank):

| After week | Prototype | Calibrated |
|---|---|---|
| 1 | 4.98 / 0.17 | 4.49 / 0.22 |
| 2 | 4.50 / 0.22 | 4.31 / 0.23 |
| 3 | 4.37 / 0.21 | 4.21 / 0.25 |
| 4 | 4.29 / 0.23 | 4.11 / 0.26 |
| 6 | 4.40 / 0.22 | 4.05 / 0.29 |
| 8 | 4.05 / 0.31 | 3.75 / 0.34 |
| 10 | 3.94 / 0.37 | 3.76 / 0.38 |
| 12 | 3.56 / 0.49 | 3.48 / 0.49 |

The calibrated model is better at every checkpoint, most of all early in the
season, which is when the prototype's problem showed. The search covered 240
combinations; the best ones form a plateau (reliability constant 3, usage
blend 0.4 to 0.6, recent share 0.15 to 0.3 all land within 0.01 MAE), so the
chosen values sit in the middle of it rather than on a lucky point.

Tried and rejected: capping single games at a multiple of the player's usual
output (1.75× or 2.5×) never improved the error, so it is off
(`outlierCap: 0`).

## Consequences

- Values move less after a few games and reward volume, which is steadier
  than touchdowns.
- Weekly fantasy points are noisy: even the calibrated model misses by about
  4 points per game on average. The site presents values as estimates.
- Every future model change can be judged by the same backtest.
- Not covered yet: teammates returning from injury (a receiver's volume rises
  while a star teammate is out and falls when he returns). That will be a
  separate, backtested change.
