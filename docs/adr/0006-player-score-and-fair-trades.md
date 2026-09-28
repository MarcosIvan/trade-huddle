# ADR 0006: Player Score, fair-trade traffic light and match-based trade ideas

- Status: accepted
- Date: 2026-09-28

## Context

Trade value (points above replacement) is the right currency, but it is not
a friendly number, and "is this trade fair?" needs a clear answer. The
product owner asked for:

- a 0-100 score per player combining how good he is at his position, how he
  is playing now, how important he is to his fantasy team, and a bonus for
  the main weapons of his NFL offense (1st > 2nd > 3rd);
- a fairness percentage with three levels: green (fair), yellow (could work
  but does not look fair), red (don't do it);
- trade ideas that are the fairest and most likely to be accepted by both
  sides, with a star on true matches, favoring deals where you send players
  you barely use.

## Decision

**Player Score** (`score.ts`):

| Part | Points | Measure |
|---|---|---|
| Level | 50 | trade value / best trade value in the league (scarcity included) |
| Form | 30 | recent points above replacement / best in the league |
| Team importance | 20 | value / best value on his fantasy roster |
| Usage bonus | +10 max | top-3 share of his NFL team's targets + carries (1st 100%, 2nd 70%, 3rd 45%), scaled by how close the share is to a lead player's at the position |

Capped at 100. The **trade score** is the same without team importance,
which depends on who owns the player; a player must be worth the same on
both sides of a trade.

**Fairness** = smaller side / larger side of the trade scores sent and
received. Green ≥ 90%, yellow 75-89%, red < 75%. Because level and form are
measured above replacement, two ordinary players do not add up to a star.
The badge always carries an icon and words besides the color.

**Trade ideas** keep the existing filters (both lineups gain; fairness at
least 75%, so never red) and are ranked by:

    match = 0.5 × fairness + 0.3 × balance + 0.2 × bench share

where balance = smaller lineup gain / larger lineup gain, and bench share =
the part of the score you send that comes from players outside your starting
lineup. Green ideas come first. A card gets "★ Best match" when it is green
and balance ≥ 0.5; when no idea qualifies, the first one gets "★ Closest to
a match".

## Consequences

- Weights are product choices, not fitted: the score is a readable summary,
  and trade value (backtested in ADRs 0001-0003) stays underneath.
- Two-for-one consolidation trades (a starter plus a bench player for one
  better player, for a team thin at the position) rank high, because the
  partner's lineup gains, the bench player costs you little, and the real
  free agent who fills your open spot is included.
- The prototype's settings (without scores) still rank ideas the old way,
  so the reference tests keep proving the port.
