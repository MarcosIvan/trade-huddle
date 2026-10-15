# ADR 0024: No quarterbacks in one-QB trade ideas, and only lineup warnings in the analyzer

- Status: accepted
- Date: 2026-10-15
- Amends: ADR 0014 (even trade ideas)

## Context

The product owner pointed out two things after using the site in a real league:

- **Quarterback trades rarely happen in one-QB leagues.** Every team already
  starts a relevant quarterback, so ideas that send or ask for one are
  proposals nobody takes, even when the values are fair.
- **The analyzer lectured about roster balance.** When building a trade by
  hand, it showed warnings such as "You would carry 3 QBs (a balanced roster
  has 2)" from the ideal roster. Each manager knows how he wants his bench;
  the site should not tell him.

## Decision

- **Trade ideas leave quarterbacks out** where the league starts only one
  (the sport's `ideaSkipPositions`, kept for a position only one lineup slot
  can start). Superflex and 2-QB leagues keep them, since quarterbacks are
  their main trade currency. The trade finder ("sell a player", "get a
  player") follows the same rule for every player it adds to the deal; only
  a quarterback the manager chose himself is kept. The analyzer still allows
  quarterbacks.
- **The analyzer shows only lineup warnings**: a position left without
  enough healthy starters, or a starter sent with no starter-level player
  left to replace him (`TradeResult.lineupWarnings`). Roster balance warnings
  (piling up or thinning a position against the ideal roster) are no longer
  shown. They still shape trade ideas, which stay position-balanced.

## Consequences

- One-QB leagues no longer see quarterback ideas even when a team holds two
  starters; choosing that quarterback in the finder covers the case on demand.
- The model's checks are unchanged: `warnings` still lists everything and
  decides whether an idea passes.
