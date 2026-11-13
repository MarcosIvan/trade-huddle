# ADR 0042: League trade report

- Status: accepted
- Date: 2026-11-13

## Context

Every league talks about its trades: who won, who got fleeced. Sleeper
lists them but never says how they turned out.

## Decision

A **League trades** section, the last of the team view (after the
position needs and playoff odds), lists the league's
completed trades this season, newest first (`model/tradeReport.ts`). Each
card shows what each team got (players, draft picks, FAAB) and two measures:

- **Value today**: the trade value of what each side received, summed as
  the analyzer's fairness does (in an uneven two-team trade the extra
  players count 30%).
- **Points since**: the points those players scored as starters for their
  new team, from the trade's week on (weeks with final scores, from each
  week's matchups: `starters` and `players_points`).

The side ahead on each measure has its chip in green; a gap under 0.05 is a
draw. Trades come from `/league/<id>/transactions/<week>` (completed trades
only), for the weeks played and the week under way.

## Alternatives considered

- **Value at the time of the trade**: needs every past day's values; the
  stats file holds only today's.
- **All points scored, benched or not**: a player who sat on the bench did
  not help his new team.

## Consequences

- Draft picks and FAAB are listed but carry no value (redraft leagues).
- Points count the regular season's weeks (the matchups fetched).
- Hidden in the demo and when Sleeper fails.
