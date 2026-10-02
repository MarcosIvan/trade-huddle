# ADR 0013: A flatter trade value scale, one injury discount and Sleeper's IR spots

- Status: accepted
- Date: 2026-10-02
- Amends: ADR 0007 (side weights, idea shapes, ideal roster), ADR 0010 (trade value scale)

## Context

After week 4 of the 2026 season, the product owner found that low-value
players were worth too little next to the stars, and that players out long
term (IR, PUP) were punished too hard. He also suspected the last games still
weighed too much.

The trade values of a real 12-team PPR league were compared, offline, with
current redraft trade values from real leagues (about 200 players), as in
ADR 0010:

- **The order was sound.** Rank correlation with the market was 0.920 (0.951
  in the top 100); players ranked 100-200 by the market sat within about one
  value point of the value at their market rank.
- **The shape was too steep at the bottom.** Raw market values fall very fast
  (a player near rank 150 is worth about 3% of the best), but trade analyzers
  people use show a flatter scale, where such a player is still worth about a
  third of the top. Ours put him at about a fifth (8 of 40). Two parts caused
  it: production measures were raised to the power 1.5, so a player producing
  30% of the elite level got 16%, and scarcity (25 of 100 weight) is zero for
  anyone below a free agent.
- **Long-term injured players were discounted twice.** Sleeper's preseason
  season projection already leaves out the games a player is expected to miss,
  and the model divides it by all 17 games. For several players out long
  term, the projection per game was 35-80% of last season's points per game,
  against a median of 85% for healthy players. Their availability (70% on IR) then discounted the
  absence again.
- **Recent form was not overweighted.** Split into quarters by how far their
  season ran above or below their prior, the hottest starts sat at the market
  (+0.0) and the coldest above it (+1.3): the market drops cold starts faster
  than the model, not slower. Through 3 games the last games weigh 0 in trade
  value. Nothing changes there.

Separately, about 180 players with no games, no projection and no draft
position (mostly retired players still listed with a team) were valued at
replacement level, up to 16 of 40.

## Decision

**Injury prior.** A player whose injury status is not startable (IR, PUP,
NA, suspended) and who played at least 8 games last season takes last season
as his prior instead of the projection (`injuredPriorGames`). His availability
still discounts the absence, once.

**Scale.**

- Production measures are raised to 1.2 instead of 1.5 (`SPREAD`).
- Trade value is `40 × (value / best) ^ 0.8` (`TRADE_VALUE_CURVE`) instead of
  linear. The order does not change; a player worth a quarter of the best
  player's raw value shows about a third of 40.
- A player with no games, no projection and no draft position is worth 1.

A floor on scarcity for players below replacement was also tried and dropped:
it hurt the rank correlation (0.920 → 0.903).

**Trade sides.** A flatter scale makes two lesser players add up to more.
The weights of a side's second and third players (`SIDE_DEPTH`) were fitted on
thousands of random 2-for-1, 3-for-2 and 3-for-1 trades between rostered
players, so that the fewer-players side keeps the same share of the trade it
had on the linear scale: `[1, 0.85, 0.7]` → `[1, 0.55, 0.4]`. The average
shift is under 1.5% for every shape (it was 7-20% with the old weights on the
new scale). One-for-one trades become a little more even, as intended.

The thresholds that classify idea shapes are ratios between trade values,
so they follow the curve: `IDEA_DEPTH_SHARE` 0.75 → 0.79 (0.75^0.8) and
`STAR_EDGE` 1.15 → 1.12 (1.15^0.8). Fairness thresholds (85% for ideas, the
traffic light) and the 10% value loss limit stay as they are.

**Ideal roster.** It must add up to exactly the league's roster spots for
quarterbacks, running backs, receivers and tight ends (`idealPlayers`, was
"at most 13"): starting slots that can hold them plus the bench, without
kickers, defenses and IDP slots; 13 in a 15-spot league with one kicker and
one defense, and 13 when the league does not say. The default fills a larger
roster with receivers and running backs in turn and trims a smaller one, the
form only applies an ideal of that size, and an ideal saved under another
size starts over from the default. Players in the IR spots do not count. Those spots now come
from Sleeper's roster data (`reserve`), not from the IR status: a player out
in an IR spot (PUP, for example) is left out, and one listed on IR but kept on
the roster counts. When the data does not say (the demo league), the IR
status decides as before.

## Results

On the same league and week, current redraft market values as reference:

| Measure                                              | Before          | After              |
| ---------------------------------------------------- | --------------- | ------------------ |
| Rank correlation, about 200 players                  | 0.920           | 0.927              |
| Rank correlation, top 100                            | 0.951           | 0.955              |
| Average gap to the value at the market rank, top 100 | 1.23            | 1.01               |
| Average gap, players out long term                   | −2.83           | −1.90              |
| Value at rank 50 / 100 / 150                         | 20 / 13.5 / 8.1 | 24.1 / 18.5 / 13.0 |
| Players in the top 300 worth less than 5             | 55              | 0                  |

- The points backtest (2024 and 2025) is unchanged, MAE 3.290 and rank
  0.473: past seasons carry no long-term injury statuses, and the scale is
  not part of the points model.
- Trade ideas for every team in that league: 20 of 36 are the same deals,
  the average fairness of passing ideas is unchanged (0.93), and the shapes
  are alike.
- In every team of that league, Sleeper's IR spots leave exactly 13
  quarterbacks, running backs, receivers and tight ends; the IR status alone
  miscounted 3 of 12 teams.

## Consequences

- Mid and low-value players are worth more next to the stars, and the Player
  Score (80 points from trade value) rises with them.
- A player out long term keeps more value early on; as he misses games, the
  season's games and availability take over, as before.
- The curve and side weights were set on one league and one week; they
  should be checked again with the mid-season recalibration.
