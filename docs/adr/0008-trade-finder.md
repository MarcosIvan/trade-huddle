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
