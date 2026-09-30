# ADR 0008: Trade finder, refills and bench depth

- Status: accepted
- Amends: ADR 0007
- Date: 2026-09-28

## Context

Trade ideas search the whole league for the best deals. The product owner
also wants to start from one player: either "what can I get for this player
of mine?" or "what would it take to get that player?". It must be a new
section; the existing trade ideas stay as they are.

The owner also refined how a trade must refill the positions it takes away:
giving up a good running back for a receiver is fine when a lesser running
back comes back in the same deal, not when only a free agent could fill in.

## Decision

**Trade finder** (`findTrades` in `trades.ts`, `TradeFinder.tsx`):

- Two modes: **sell** one of your players (partners: every other team) or
  **get** a player from another team (partner: his team). The chosen player
  is always in the deal.
- Shapes, as [you send, you get]: 1-1, 2-1, 1-2, 2-2, 3-2, 2-3
  (`FINDER_SHAPES`). No 3-for-1 or 1-for-3: those deals rarely happen.
- Candidates: the chosen player plus the best 9 by trade value on his side,
  the best 10 on the other. At most about 36,000 deals are evaluated in sell
  mode (similar to the trade ideas search), about 3,000 in get mode, in a
  Web Worker.
- Same rules and ranking as trade ideas (`ideaProblems`, `sortIdeas`): value
  first, at least 85% fair, positions sound, needs matched. Up to three
  deals; sell mode prefers different partners.
- The best true match gets "★ Best match"; when none is a true match, the
  first gets "★ Closest to a match".
- When no deal passes every rule, the closest one is shown (fewest problems,
  then best match) with what it is missing, in words: the trade value gap,
  lineups that do not improve, or position problems on either roster.

**Refilling what you send** (`positionCheck`, `positionFit`): every position
you send must be refilled by a player you get back at that position or by a
spare you already have. A free agent alone is not enough: the owner does not
want to be left without a real backup (for example, three running backs for
two RB slots and a flex, trading one for a receiver only). The best free agent
at the position is still named as depth in the analyzer, and `positionFit`
weights each refill by the player's trade value (player back or spare 1, free
agent 0.4), so the more valuable the player sent, the more a same-position
counterpart matters in the ranking (match weight 0.15).

**Bench depth in team gain** (`benchDepth`): a team's strength is its
starters plus 20% (`DEPTH_WEIGHT`, about how often a starter misses a week)
of what the best healthy backup at each position scores above a free agent.
Trade ideas and the finder filter and rank by this total gain (`gainMe`,
`gainThem`); starters may dip at most 0.5 points per game on either side
(`MAX_STARTER_DIP`) and only when depth makes up for it. The cards keep
showing the starters' change, with a separate "Your bench" chip. Example from
the owner's league: sending a running back for a receiver plus one of the
partner's spare running backs now ranks first, fair at 95%.

**Match quality** becomes `0.35 × fairness + 0.2 × balance + 0.2 × need fit +
0.15 × position fit + 0.1 × bench share`, with balance measured on total
gains.

**Open roster spots** (`withFreeAgents`): the free agent added to an open spot
never piles up a position (no third QB) and, when no free agent improves the
lineup, goes to the thinnest position.

**Three trade ideas, with your edge** (`suggestTrades`): ideas are sorted
fair (green) first, then those where your starters gain at least as much as
the partner's (`hasEdge`), then match quality and your gain. There are always
three when trade values are known: if fewer deals pass every rule, the
nearest ones (fewest problems, same order, you must still gain) fill the
list, preferring new partners and players of yours not already offered, and
the card lists what each is missing.

**Tradable positions** (`SportConfig.tradePositions`): kickers and defenses
are left out of trade ideas and the finder; they are streamed from free
agency, not traded.

## Consequences

- The rule checks behind trade ideas are now one function (`ideaProblems`),
  so ideas and the finder cannot drift apart.
- Trade ideas changed with the refill, depth and K/DEF rules; the prototype
  path (no trade values) is unchanged and its reference tests still pass.
- Stricter refills mean fewer ideas for some rosters; the finder shows the
  closest deal when none passes.

## Amendment (2026-09-29): no same-position 1-for-1 ideas

Trade ideas skip one-for-one swaps between players of the same position
(`isSamePositionSwap`). The owner found they rarely help either side: one
team always gets the lesser player, so they mostly showed up as near misses
filling the three spots. The trade finder and the analyzer still allow them,
since there the owner picks the players.

## Amendment (2026-09-30): the deals that excite, and three finder deals

The owner found 2-for-2 ideas between players of alike value dull ("nobody
will make them") and asked trade ideas to focus on the shapes that are worth
a second look (`isIdeaShape`):

- **1-for-1** at different positions, alike in value.
- **2-for-1 and 3-for-2** (and the other way round): the side sending fewer
  players sends better ones, each worth more than any player coming back, at
  positions the other side sends.
- **2-for-2 crossed**: a star at one position and a depth player at another
  for a star at that other position and a depth player at the first (high RB +
  low TE for high TE + low RB). A depth player is worth at most 75% of the star
  on his side (`IDEA_DEPTH_SHARE`).
- **2-for-2 consolidation** (`isConsolidation`): two alike good players for a
  star worth at least 15% more than the better of them (`STAR_EDGE`), at one of
  their positions, and a depth player; or the other way round.

Trade ideas now search up to three players a side (the candidates stay the
best 10), but only deals in these shapes are evaluated.

**Depth lean** (`depthLeans`, `ideaLean`): a team with at least one more
starter-level player than the league average (worth at least the league's
last starter at the traded positions) leans to consolidate them into stars
(2-for-1, 3-for-2, consolidation); one with at least one fewer leans to spread
a star into more good players (1-for-2, 2-for-3, the reverse consolidation). It is
a preference, not a rule: in the ranking it comes after fairness and your
starters' edge, before the match quality.

**Trade finder**: it uses the same shapes and lean, and always shows three
deals, best first. When fewer than three pass every rule, the closest ones
(fewest problems) fill the list with what they are missing, as in trade ideas.
Every true match gets the star, not only the first. `FINDER_SHAPES` remains for
the prototype path without trade values.
