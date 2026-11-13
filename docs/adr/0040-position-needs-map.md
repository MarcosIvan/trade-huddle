# ADR 0040: Position needs map

- Status: accepted
- Date: 2026-11-13

## Context

Trade ideas pick partners by need, but the manager never sees the league's
needs: who is deep where, who is thin, who is strong overall. That is what
tells you whom to call with an offer.

## Decision

A **Position needs** table, at the end of the team view next to the playoff
odds, ranks every team (`model/needsMap.ts`):

- **Roster**: the best lineup's points per game plus bench depth
  (`benchDepth`, as trades weigh a team). Teams are listed by it, strongest
  first, so the table also reads as power rankings.
- **Lineup**: the best starting lineup's points per game.
- **Each position, Start and Bench**: the average expected points per game
  of the team's best `k` healthy players there, and of the next `k`, where
  `k` is the position's own lineup slots (`ownSlots`: flex slots left out,
  superflex as a QB): QB 1 (2 in superflex), RB 2, WR 2, TE 1; one at each
  NBA position. A missing backup counts as zero, so a thin bench ranks low;
  a team with no backup at all shows a dash.

Every rank is among the league's teams (1 the strongest), in the matchup
labels' five colors (`rankLevel`): darkest green among the strongest fifth,
darkest red among the weakest. Values are expected points per game from here
on, the model's value, the same measure trades use, not season totals.

## Alternatives considered

- **Season points**: they measure the past and favor players with more
  games; trades are about the weeks ahead.
- **The flex in the starters** (as `teamNeeds` counts a backup RB and WR):
  the number of starters would change with each team's flex choice; own slots
  measure every team alike, and the flex shows in the bench column.
- **Inside the trade ideas' column**: too narrow for ten or more columns; the
  owner wanted it full width, at the end of the page.

## Consequences

- Positions are each player's main position (in the NBA a PG/SG counts as a
  PG), as everywhere in the model.
- The map is information: it does not change trade ideas.
