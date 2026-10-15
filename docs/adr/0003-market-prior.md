# ADR 0003: Use Sleeper's preseason projection as the prior

- Status: accepted
- Date: 2026-09-28

## Context

Until now a player's prior (what we believe before this season's games) was
his last season. Last season knows nothing about age, a new team or role,
a star teammate arriving or leaving, or rookies, who fell back to
replacement level. Sleeper publishes preseason projections for every player,
as stat totals, and the pipeline now stores them (ADR 0002). Stat totals can
be scored with any league's rules, like everything else in the model.

Checked for leakage: past-season projections are preseason values (players
who were hurt early in the season are still projected for a full one).

## Decision

- The prior is the preseason projection, in points per game under the
  league's scoring, times 1.05 (Sleeper's projections run slightly
  conservative). Players without a projection keep last season.
- A projection counts as a full track record, so rookies with a projection
  start from it instead of replacement level.
- The prior fades by reliability `8 / (8 + games)`: 73% after 3 games,
  50% after 8. It is stronger than before (ADR 0001 used 3) because a
  projection is a better prior than last season.
- Usage blend goes from 50% to 30% of each game.

## Evidence

Rest-of-season backtest (2024 and 2025, half-PPR and PPR, checkpoints after
weeks 1 to 12):

| Model | MAE (pts/game) | Rank correlation |
|---|---|---|
| Prototype | 4.26 | 0.28 |
| ADR 0001 + ADR 0002 | 3.88 | 0.36 |
| **Preseason projection as prior** | **3.35** | **0.47** |

| After week | Prototype | Before | Projection prior |
|---|---|---|---|
| 1 | 4.98 / 0.17 | 4.19 / 0.30 | 3.15 / 0.51 |
| 3 | 4.37 / 0.21 | 4.03 / 0.31 | 3.23 / 0.46 |
| 6 | 4.40 / 0.22 | 3.95 / 0.33 | 3.47 / 0.42 |
| 12 | 3.56 / 0.49 | 3.45 / 0.50 | 3.50 / 0.51 |

The gain is largest early in the season and fades by week 12, when this
season's games dominate either way. Settings near the chosen one form a
plateau (projection weight 0.9 to 1, scale 1.05 to 1.1, reliability 8 to 12,
usage 0.2 to 0.4 within 0.01 MAE).

## Consequences

- In a real league after week 3 of 2026, a receiver with a strong projection
  and steady production now ranks above one with a weak projection whose hot
  start came while a teammate was out.
- The site now depends on Sleeper publishing projections. Without them it
  falls back to last season, as before.
- Sleeper's projection for the current season may be updated during the
  season; that is fine for a prior (it only adds information), but backtests
  must keep using past seasons, whose projections are preseason.
