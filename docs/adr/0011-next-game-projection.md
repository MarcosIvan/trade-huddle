# ADR 0011: Sleeper's next-game projection in the expected points

- Status: accepted
- Date: 2026-09-30
- Amends: ADR 0005 (weekly lineup weight)

## Context

A breakdown of the rest-of-season backtest (2024 and 2025, checkpoints after
weeks 1-12, half PPR and PPR, 6,113 predictions) showed where the expected
points per game miss most: quarterbacks, rookies, players who just missed a
game and the last weeks of the season. It also showed that Sleeper's
projection for a player's next game, on its own, predicted the rest of the
season about as well as our model, and better in exactly those cases. The
site only used it for the weekly lineup.

## Decision

Mix Sleeper's projection for the next game into the expected points per game
(`nextGameBlend`), after the prior, this season, recent form and the pull
toward replacement level, and before the injury rule:

    expected = 70% × our estimate + 30% × next-game projection

- It only counts when the player is expected to play: a positive projection
  and an injury status that still lets him start. A player listed out would
  otherwise drag his whole season toward zero.
- The next game is the lineup week, once it comes after every week played.
- In the backtest only the projection for the week right after the
  checkpoint is visible: later weeks' projections were made later, with
  information the model could not have had.

**Backtest** (mean absolute error in points per game, rank correlation within
position):

| Weight                                       | MAE       | Rank      |
| -------------------------------------------- | --------- | --------- |
| 0 (before)                                   | 3.344     | 0.467     |
| **0.3**                                      | **3.290** | **0.473** |
| 0.4                                          | 3.286     | 0.471     |
| by position (QB 0.6, RB 0.4, WR 0.3, TE 0.4) | 3.278     | 0.467     |

A single weight of 0.3 is the only setting that improves both error and
ranking; heavier weights for quarterbacks lower the error slightly but rank
them worse.

**Weekly lineup.** Our value now already holds 30% of the same projection, so
the lineup's own weight on it goes from 0.75 to 0.65 (`weekProjWeight`): the
projection still weighs about 75% overall. The week-ahead backtest stays where
it was (MAE 5.530 before, 5.536 now; 5.543 had the weight stayed at 0.75).

## Consequences

- The value reacts to news that Sleeper's projection already reflects (a new
  role, a teammate's injury, a starting quarterback change) the day after.
- The daily build already downloads the projection for the lineup week; no
  new data is needed.
- Players without a projection (deep bench, no team) keep the previous
  estimate.
