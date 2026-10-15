# ADR 0025: Trade finder by position, player search, and position leaders

- Status: accepted
- Date: 2026-10-15
- Amends: ADR 0008 (trade finder), ADR 0014 (even trade ideas)

## Context

The trade finder worked around one chosen player: sell one of yours, or get
one from another team. Managers often think one step earlier: "I want a top
receiver, and I am willing to move this running back". Neither mode covers
that: "get a player" needs the exact player, and "sell a player" does not
look for a position.

They also had no place to see who leads each position in the league, by the
site's trade value or by what players have actually scored, to judge which
targets are worth asking for.

Picking the player to get from a list of every other roster (hundreds of
names grouped by team) was slow.

## Decision

- **A third finder mode, "Get a position"**: the manager picks a position, a
  tier (top 5, 10, 15, 20 or 30 by trade value among every rostered player
  at it) and, optionally, one of his players to offer.
  `findTargetTrades` searches every team that has a player in that tier.
  - **Only 2-for-2.** A straight swap of a lesser player for a clearly better
    one at the same position is never accepted, so each side adds one more
    player; deals still follow the trade ideas' shape rule (value moves
    between positions), fairness and ranking, with different partners when
    possible.
  - Positions offered are the traded ones minus those trade ideas skip in
    the league (quarterbacks in one-QB leagues, ADR 0024).
  - The three finder modes share one search loop (`searchDeals`).
- **"Get a player" uses a name search**: typing lists up to 8 matching
  players on other teams (ARIA combobox; accents, case and punctuation
  ignored; every typed word matches the start of a word of the name).
  "Sell a player" and "Get a position" keep the plain list of your players.
- **The finder shows at most three deals**, side by side on wide screens
  (1360px and up) and one per row below, so both sides of each card keep
  players' full names on one line.
- **A "Leaders" tab**: the league screen gets two tabs, "Team & trades"
  (everything before) and "Leaders". Leaders lists the top 30 at each
  position, free agents included, ranked by trade value or by fantasy points
  this season (total, with points per game beside it); your players are
  highlighted. In the NBA a player is listed at his main position, as the
  finder's tiers count him.
- Shared UI pieces: `Segmented` (radio buttons as one control), `Tabs`
  (ARIA tablist), `PlayerSearch` (the combobox); logic in
  `lib/model/leaders.ts` and `lib/playerSearch.ts`.

## Consequences

- One more search per change of position, tier or offered player; it runs in
  the finder's Web Worker and only tries pairs that include a tier player, so
  it costs about as much as "sell a player".
- A tier counts your own players, so "top 5 WR" may leave fewer than five
  targets on other teams, or none (the finder then says no deal was found).
- The trade idea cards now show the name on top, positions below and the
  trade value at the right, in the trade ideas list too.
