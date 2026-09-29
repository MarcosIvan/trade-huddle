# ADR 0007: Composite trade value, value-first and position-balanced trade ideas

- Status: accepted
- Date: 2026-09-28
- Supersedes: the "Level / Form / usage bonus" parts of ADR 0006

## Context

Trade value was points per game above replacement (VORP). In a simulated
12-team half-PPR league drafted by ADP, 48 of 180 rostered players had a
trade value of 0, including starting quarterbacks (Drake Maye, Bo Nix,
Justin Herbert) and injured stars. Injured players were penalized twice:
the injury multiplier cut their points per game, and replacement level was
then subtracted from what was left. The scale also had cliffs that market
analyzers (for example FantasySP's 1-100 rating, where anything above about
85% is a fair trade) do not have.

Trade ideas had three more problems reported by the product owner:

- they could send higher-value players for lower-value players who were
  simply scoring more lately;
- they could bring in a position the roster did not need (a third QB) or
  leave a position short;
- a "fair" sum of scores could hide a loss of value on every player.

The owner asked for a robust value built from several variables: what the
player has proven, what he is producing now, his last 3 games, how much
better he is than the average at his position and how important he is to
his team.

## Decision

**Trade value** (`score.ts`), 1 to 100. Each part is on a 0-1 scale that is
comparable across positions (production is measured against the average of
the position's top 3, raised to 1.5 so gaps still count):

| Part | Weight | Measure |
|---|---|---|
| Base | 15 | preseason projection, or last season |
| Market | 15 | draft ADP in the league's format, `1 / (1 + (ADP/40)²)`; fades by `8 / (8 + games)`, the rest goes to Expected |
| Expected | 15 | expected points per game from here on (the backtested model of ADRs 0001-0003) |
| Season | 10 | points per game this season |
| Recent | 10 | points per game over the last 3 games |
| Edge | 10 | distance above the average starter at the position, in standard deviations, through a logistic |
| Scarcity | 10 | √(points above replacement / the league's best) |
| Usage | 15 | share of the NFL offense's targets + carries relative to a lead player (QB, K, DEF use Expected) |

While a player has played no more games than the recent window, Season and
Recent are the same games: Recent's weight and half of Season's move to
Base, so three games cannot swing the value on their own.

The sum is multiplied by:

- **position scale**: 0.5 + 0.5 × (the position's elite VORP / the scarcest
  position's elite VORP), so running backs stay ahead of receivers with
  similar output in one-QB leagues and quarterbacks gain in superflex;
  K and DEF use 0.3;
- **availability**: an injured player keeps 40% of what his injury rule
  takes away (IR: 70%, Out: 94%), because he comes back; a player without a
  team keeps 25%.

Values are relative to the league's best player (100), and nobody goes
below 1. Team importance on the fantasy roster stays out of trade value
because it changes with the owner; it is 20 of the 100 points of the
**Player Score** (80% trade value + 20 × importance).

**Fairness** compares trade value on each side. The best player of a side
counts in full, the second 85% and the third 70% (`SIDE_DEPTH`), so two good
players do not add up to a star. Green ≥ 90%, yellow 75-89%, red < 75%.

**Trade ideas**, when trade values are known, must also:

- be at least 85% fair (`MIN_IDEA_FAIRNESS`), so the partner does not lose;
- never cost you more than 10% of the value you send (`MAX_VALUE_LOSS`):
  value comes first, a lineup gain alone does not justify a loss;
- keep both rosters' positions sound (`positionNeeds`): every position keeps
  its starters plus one backup at RB and WR (superflex counts as a second QB
  slot), and no roster piles up more than one spare QB, TE, K or DEF;
- refill every position you send, unless you have a spare there
  (`positionFit`).

**Needs.** Each team's strength at a position is the average value of its
best players there (as many as its lineup starts, plus the flex backup at RB
and WR), ranked against the other teams: need 0 = the league's strongest,
1 = the weakest (`teamNeeds`). A side's need fit is `0.6 × need at the
position of the best player it gets + 0.4 × (1 − need at the position of the
best player it sends)`: buy where you are weak, sell where you are strong.
Cards say "Fills your need at WR" / "Fills their need at RB" when the best
player a side gets plays where it is in the bottom half of the league.

Match quality is `0.35 × fairness + 0.2 × balance + 0.2 × need fit (average
of both sides) + 0.1 × position fit + 0.15 × bench share`. A true match must also keep both rosters' positions
sound. The trade analyzer shows the same position warnings in words.

## Calibration

The weights were set against the owner's own reading of week 3 of 2026 and
checked against the market:

- Tuten (RB) 48 > Adams 47 > Washington 45 > Egbuka 44: three receivers
  close together, the running back above them;
- London 53 > Adams, Tyreek Hill (no team) 2;
- rank correlation with half-PPR ADP among rostered players: 0.78 with
  VORP, 0.86 with the composite value; no rostered player at 0 (minimum 2.9).

## Consequences

- Trade value is a product score on top of the backtested points model, not
  a new prediction: Expected keeps the backtested estimate, the other parts
  add what the owner and the market weigh.
- ADP only exists for players drafted this season; undrafted players simply
  get 0 in that part, and it fades as games are played.
- Value above replacement still drives replacement levels, lineups and the
  prototype reference tests, which are unchanged.
- The weights are constants in `score.ts`; they should be revisited with a
  backtest against rest-of-season results once more weeks are available.
