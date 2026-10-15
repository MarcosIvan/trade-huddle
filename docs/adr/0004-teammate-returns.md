# ADR 0004: Teammates returning from injury (tested, not enabled)

- Status: rejected for now; the code stays, switched off
- Date: 2026-09-28

## Context

While a star is out, his teammates get more targets and carries; when he
returns they lose them. In 2026, for example, a receiver went from 6 to 10 to
13 targets after his team's top target got hurt in week 1. The product owner
asked for values to account for that.

## What was built

`web/src/lib/model/teammates.ts`: for each offensive player, find the most
important teammate (prior of at least `keyTeammatePpg` points per game) who
missed the team's last game while the player played it and who has an
injury-report status (Questionable, Doubtful, Out, IR, PUP, NA, Sus; players
missing without a status were cut, benched or traded). The player's form is
split into games with and without that teammate (his prior stands in for
"with" when they have not played together yet) and the rest of the season
is expected to be a mix, weighted by the teammate's chance to play
(`teammateReturn`, 60% of it for IR/PUP/NA).

## Evidence

Past seasons have no injury report, so the backtest emulates one: a player
who missed week N and plays again later is listed as Questionable. The
comparison is on the players the adjustment changes
(`npm run backtest:teammates`, 2024-2025, half-PPR and PPR, weeks 2-12):

| Return chance | Cases | MAE without | MAE with | Closer to reality |
|---|---|---|---|---|
| 0.3 | 4921 | 2.108 | 2.127 | 46% |
| 0.5 | 4921 | 2.108 | 2.111 | 46% |
| 0.7 | 4921 | 2.108 | 2.130 | 48% |
| 0.9 | 4921 | 2.108 | 2.188 | 45% |

It never helps, even with an injury report that knows who comes back. In
the real league it also produced changes with the wrong sign (a quarterback
losing value when his best receiver returns), because one to three games
with and without a teammate are mostly noise. The preseason projection
(ADR 0003) already assumes the full roster, and it carries most of the
weight early in the season, which is when these splits are smallest.

## Decision

Keep the code and its tests with `teammateReturn: 0`. Revisit when there is
more signal to work with: a stored history of real injury reports, or
per-game snap and route shares instead of whole-game splits.

## Consequences

Values do not change when a teammate is out. The analyzer still shows the
weekly bars, so a user can see a player's volume jump while a teammate is
out and judge it.
