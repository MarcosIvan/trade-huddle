# ADR 0014: Even trade ideas, no free agents and no ideal roster setting

- Status: accepted
- Date: 2026-10-02
- Amends: ADR 0008 (idea and finder shapes), ADR 0013 (ideal roster)

## Context

Users of the site gave three kinds of feedback on trade ideas:

- **Free agents carry little value for them.** Uneven ideas (2-for-1, 3-for-2
  and the other way round) counted the free agent who fills the open roster
  spot. When the league had a free agent our trade value rated well, the
  model could suggest three very good players for one very good player and a
  star, a deal nobody saw as fair.
- **Real trades are mostly 2-for-2**: a manager gives a little value at one
  position and gets a little at another. 1-for-1 trades happen between
  players of very close value, and only when the team giving the player has
  someone of starting level to take his place. Bigger deals (3-for-3) are rare
  and need a star to happen.
- **The ideal roster setting and the "Fills your need" badges no longer added
  much**, and the "What is missing" list on near-miss cards was more than
  people needed.

## Decision

1. **Ideas and the trade finder are always even**, 1-for-1 or 2-for-2
   (`isIdeaShape`, `MAX_IDEA_PLAYERS`). With as many players each way, no
   roster spot opens, so ideas never add or count a free agent (no pickups,
   and no free agent "backups" to cover a thinned position). The analyzer
   still takes any deal and still names the free agents for uneven ones.
2. **2-for-2 must move value between positions**: the trade value you gain at
   the positions where you gain any (`positionShift`) is at least 15% of the
   best player in the deal (`POSITION_SHIFT`). That covers crossed deals (high
   RB + low TE for high TE + low RB) and consolidations (two good players for a
   star and a lesser bench player that balances the values), and leaves out
   alike players at the same positions.
3. **1-for-1 needs very close values**: at different positions, the lesser
   player worth at least 90% of the other (`ONE_FOR_ONE_FAIRNESS`).
4. **A starter leaves only with a starter-level replacement.** For each
   position a team sends and gets nobody back at, it must keep as many players
   at or above the league's starter line as before, up to its slots there
   (`starterGaps`). The starter line is the value of the Nth best player at
   the position, N being the number of teams times the lineup slots only that
   position fills (`starterLine`). It applies to every deal built with trade
   values, the analyzer included, and shows as a warning there.
5. **Ranking prefers 2-for-2**: fair (green) first, then 2-for-2 before
   1-for-1 (`SHAPE_PREFERENCE`), then the order of ADR 0008. Since 2-for-2
   deals would then fill all three cards, the last card goes to the best fair
   1-for-1 that passes every rule, when there is one (`withOneForOne`).
6. **3-for-3 was tried and dropped.** With a star required (the league's Nth
   best traded player, N the number of teams), it made the search about 3
   times slower in a 12-team league and only reached the list in 3 of 36
   ideas. Ideas also skip red deals (below 75%) before evaluating them.
7. **No ideal roster setting.** The − and + editor and its saved setting are
   gone. Its league default (the roster size spread over QB, RB, WR and TE,
   ADR 0013) still guides positions and needs, so ideas keep the same roster
   balance; warnings now say "a balanced roster has N".
8. **Cards are simpler**: no "Fills your need / their need" badges (cards or
   analyzer) and no "What is missing" list. Near misses still fill the list
   when fewer than three deals pass.

## Consequences

On a 12-team half-PPR league drafted by ADP with the stats of week 4 of 2026
(36 ideas, 3 per team):

|                      | Before  | After  |
| -------------------- | ------- | ------ |
| Uneven ideas         | 9       | 0      |
| 2-for-2 / 1-for-1    | 13 / 12 | 34 / 2 |
| Pass every rule      | 35      | 34     |
| Green                | 35      | 35     |
| Search, all 12 teams | 5.8 s   | 8.6 s  |

1-for-1 ideas are rarer because most fail the 90% value rule or the
starter-level rule, as intended. The search runs in a Web Worker, so the
extra time only delays the cards.
