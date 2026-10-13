# ADR 0022: NBA calibration on past seasons

- Status: accepted
- Date: 2026-10-13

## Context

The NBA model (ADR 0020) took its numbers from the NFL's, scaled to an
82-game season: the last 12 games as recent form and a prior worth 38 games.
It had not been measured against real NBA seasons. Three questions were open:

- whether 9 or 12 games make the better recent form;
- whether a player's durability should count. The model values points per
  game, but in a long season the games a player misses also cost his fantasy
  team;
- whether the centers' market discount (`positionMarket`) is right at the
  bottom of the scale.

## Decision

**A backtest for the NBA** (`npm run backtest:nba`, `web/scripts/backtest/nba.run.ts`)
runs on Sleeper's 2024-25 and 2025-26 seasons. It uses two points scorings
(Sleeper's default and a heavier one), 12 teams, and checkpoints after
fantasy weeks 1 to 18. The past files are built with
`python -m trade_huddle_data build --sport nba --season 2024` (and `2025`)
and stay in `.cache/`, outside the site.

**Sleeper's season projections for a past NBA season are its real averages.**
They correlate 0.998 with what players scored. The NFL's correlate 0.88 to
0.91, as real projections do. Used as the prior, the NBA's would leak the
future. The backtest uses each player's projection for his first game of week
1 instead, which was made before the season. That projection is as good a
prior as last season (0.81 to 0.88), but it runs 7% to 11% below the season's
average. So it cannot calibrate the projection's scale, and `projScale` stays
at 1.05.

Results (points per game after each checkpoint, averaged):

| Settings                         | MAE  | Rank  |
| -------------------------------- | ---- | ----- |
| before: prior 38 games, last 12  | 4.24 | 0.678 |
| **now: prior 10 games, last 12** | 3.92 | 0.718 |
| best: prior 5 games, last 12     | 3.86 | 0.725 |

- **Prior: 10 games** (`prevReliabilityGames`), down from 38. The prior's
  weight is 10 / (10 + games): half after 10 games, a fifth after 40. Per-game
  numbers settle fast in basketball, since minutes drive them. The error is
  almost flat from 5 to 10 games. 10 is the cautious end, because on the site
  the prior is the real season projection, likely better than the stand-in
  used here. The draft market's weight in trade value fades at the same rate
  (k / (k + games)).
- **Recent form: 12 games**, unchanged. 9 and 12 games are within 0.5% of
  each other at every setting, and the share given to recent form (0.25 or
  0.4) moves the error by less than 0.5% too.
- **Durability** (`TradeValueParams.durability`, `model/durability.ts`). It is
  the share of his teams' games a player has played this season, through
  trades, as if he had 40 more team games at a typical 80%. Trade value is
  multiplied by it. The backtest judges points per team game for the rest of
  the season, missed games included. Past files have no injury report, so the
  gain is measured on players who played their team's last game, healthy at
  the checkpoint, because the site already discounts injured players by their
  status. Over those players, rank correlation goes from 0.437 to 0.458; over
  everyone, from 0.276 to 0.377. Last season's games made it worse at every
  weight, so only this season counts. Before a game is played everyone shares
  the typical 80%, and nothing changes. The NFL leaves it out (`null`): a
  17-game season is left to the injury status.
- **Centers: the discount stays at 0.35.** Against the draft market (ADP),
  preseason trade value matches best with 0.2 (correlation 0.905 against
  0.896). With 0.35, centers drafted 51st to 150th sit about 20 places below
  their ADP. At the bottom of the scale (ADP 151-200) they sit 2 places below,
  in line with it. 0.35 follows trade markets, which price centers below
  draft markets, so it stays until trade values say otherwise.

## Consequences

- From the first games, NBA trade values follow what players do this season
  much sooner than before. Preseason values do not change.
- A player who has missed many of his team's games is worth less in trades.
  The site's per-game value, used for lineups and a trade's points per game,
  does not change.
- A player out right now loses value twice: through his injury status and
  through the games he has already missed. The backtest cannot measure this,
  because past files have no injury report.
- The backtest's prior is a stand-in. Once a season with real preseason
  projections is kept (the daily file of 2026-27 before its first game), the
  prior and its scale can be checked again.
