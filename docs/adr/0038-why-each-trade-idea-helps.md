# ADR 0038: Why each trade idea helps, in one line

- Status: accepted
- Date: 2026-11-13

## Context

A trade idea card shows the players, how much each side's starters gain,
and the fairness meter. It does not say _why_ the deal works: which
position each team fixes, and what it costs you. That is what a manager
needs to judge an idea at a glance, and what convinces the partner when
the offer goes out.

## Decision

Every trade idea and trade finder card shows one sentence under the
players, built from where each team ranks among the league's teams before
and after the deal (`model/ideaReason.ts`):

> You go from 11th to 4th at TE and stay 2nd at RB; they go from 9th to 3rd at RB.

- **Position rank**: a team's strength at a position is the average points
  per game of the best healthy players its lineup starts there (plus the
  flex backup at RB and WR), the same measure as the teams' needs
  (`positionStrength`, shared with `teamNeeds`). Rank 1 is the strongest;
  ties share a rank.
- **Lineup rank**: the best starting lineup's points per game. In the NBA
  most gains come through the flexible slots (G, F, UTIL), where no single
  position moves, so the lineup rank tells the story there.
- **Each side's gain**, in this order: the position of a player who moves
  that climbs most in rank; the whole lineup climbing; the position that
  gains most without climbing ("strengthen WR (still 1st)"); the lineup
  gaining without climbing; otherwise "add depth".
- **Your cost**: the position of a player who moves that falls most in rank
  ("drop from 1st to 3rd at RB"), or that weakens without falling ("stay 2nd
  at RB"); "without weakening another position" when none weakens.
- **The partner's cost** is said only when it gains nowhere ("they drop from
  1st to 4th at TE"), as in the trade finder's closest deals, so a deal that
  hurts the partner never reads "they add depth".

The reason is computed in the worker with the search (`withReasons`) and
travels with each idea. The tooltip explains what the ranks measure. The
reason is information: it does not change the search, the ranking or
fairness.

## Alternatives considered

- **Repeating the points per game** ("+1.2 pts/g in your lineup"): the
  chips under the line already show them; ranks say where the team stands
  in its own league, which numbers alone do not.
- **Only the positions, as in the NFL**: NBA ideas mostly read "add depth",
  because their gains come through flexible slots.
- **The partner's cost always**: two more clauses, and the line no longer
  fits in one line on a phone.

## Consequences

- Trade ideas and the trade finder explain themselves in both sports; the
  pick ideas and the analyzer are unchanged.
- `positionStrength` and `positionRank` are ready for the league's position
  needs map.
