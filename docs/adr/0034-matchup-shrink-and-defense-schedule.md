# ADR 0034: Steadier matchup factors, and team defenses valued with their schedule

- Status: accepted
- Amended by: ADR 0036 (matchup labels by rank, since the 8% cut left almost
  every game neutral)
- Date: 2026-11-12
- Amends: ADR 0005 (weekly lineup), ADR 0015 (player card matchups), ADR 0026
  (schedule in the analyzer)

## Context

Every matchup on the site comes from one measure (`defenseFactors`, ADR
0005): what each defense allowed to a position per game so far, against the
league average, pulled toward average by `matchupShrinkGames` games of an
average defense. The weekly lineup, the Good / Neutral / Tough labels, the
player card and the analyzer's schedule columns all use it. The shrink was 2
games in the NFL and 8 in the NBA.

The product owner asked to review how much matchups weigh, and whether a
defense's strength could also come from its roster (how its defenders are
valued), since rosters change during a season. He also asked whether team
defenses (DEF) could be projected better.

## What was checked

A new backtest, `npm run backtest:matchups` (2024 and 2025), asks two
questions.

**1. How well does the factor so far predict the factor afterwards?** After
checkpoint N, the mean squared error of each defense's factor against the
factor it allowed from then on, for several shrinks (∞ = every defense
average):

| NFL position | 0      | 2      | 8          | 32         | 64         | ∞      |
| ------------ | ------ | ------ | ---------- | ---------- | ---------- | ------ |
| QB           | 0.0493 | 0.0375 | 0.0294     | **0.0272** | 0.0274     | 0.0282 |
| RB           | 0.0572 | 0.0436 | 0.0340     | **0.0310** | **0.0310** | 0.0316 |
| WR           | 0.0417 | 0.0302 | 0.0220     | 0.0190     | **0.0188** | 0.0190 |
| TE           | 0.1052 | 0.0753 | 0.0552     | **0.0497** | 0.0501     | 0.0518 |
| DEF          | 0.1959 | 0.1542 | **0.1414** | 0.1616     | 0.1727     | 0.1899 |

| NBA position | 0      | 8      | 32         | 64         | ∞          |
| ------------ | ------ | ------ | ---------- | ---------- | ---------- |
| PG           | 0.0271 | 0.0217 | 0.0185     | **0.0179** | 0.0181     |
| SG           | 0.0456 | 0.0387 | 0.0348     | **0.0339** | **0.0339** |
| SF           | 0.0403 | 0.0317 | 0.0267     | 0.0255     | **0.0248** |
| PF           | 0.0438 | 0.0394 | 0.0369     | **0.0364** | **0.0364** |
| C            | 0.0258 | 0.0226 | **0.0214** | 0.0216     | 0.0229     |

With 2 games, what a defense allowed to players predicted the rest of the
season worse than calling every defense average. There is a little real
signal, but it needs about 32 games of average mixed in (NFL) or 64 (NBA).
For DEF, the factor is what offenses give to team defenses (sacks,
turnovers, few points), and it holds up much better: 8 games is best.

**2. Team defenses' rest-of-season value.** For NFL defenses at weeks 3 to
12 (640 rows), the value against the points they scored afterwards, after
pulling the value toward the position's average (`regress`) and scaling it
by the opponents left (`factor ^ elasticity`, factors with 8 games of
shrink). Fitted on one season and judged on the other:

| Model                                                  | MAE (pts/game) |
| ------------------------------------------------------ | -------------- |
| Same average for every defense                         | 1.839          |
| Value as is                                            | 1.824          |
| Out of sample (2024 fit: 0.5 / 1; 2025 fit: 0.7 / 1.5) | 1.758          |
| Fitted on both (regress 0.6, elasticity 1.5)           | 1.742          |

It helps in both seasons (2024: 1.821 → 1.705; 2025: 1.828 → 1.780).

**The weekly lineup does not change.** Sleeper's weekly projection, 65% of
the weekly number, already prices the opponent. A heavier matchup weight
only made the week-ahead error worse (`backtest:weekly`), and the new
settings tie the old ones (MAE by position, top of each position by
prediction, weeks 4-17: QB 6.099 → 6.110, RB 5.443 → 5.438, WR 5.617 →
5.615, TE 4.977 → 4.954, DEF 4.066 → 4.074).

**A defense's roster did not help.** Two measures of each team's defenders
were tried offline, week by week: their contracts (average yearly salary as
a share of the cap) and the sum of Sleeper's weekly projections for its
individual defensive players (all their stats, or only sacks, interceptions
and fumbles). Contracts showed no signal (correlation with later points
allowed between −0.07 and +0.03; with DEF points +0.03). Defenders'
projections showed a little (best against RBs, −0.27), but improved the
factor's error by about 1%, the DEF week-ahead error not at all (4.084 →
4.086 on top of Sleeper's DEF projection), and the DEF rest-of-season value
in one season only. Neither is used.

## Decision

- NFL: `matchupShrinkGames` 2 → 32, with 8 for DEF (`matchupShrinkByPos`).
- NBA: `matchupShrinkGames` 8 → 64.
- NFL team defenses' value (`scheduleValue`, `model/scheduleValue.ts`):
  `(average + 0.6 × (value − average)) × factor ^ 1.5`, where `average` is
  the mean value of the league's defenses and `factor` the average factor
  of the opponents left in the league's fantasy season (regular season and
  playoff weeks). Not applied before the season's first games (it was
  fitted on weeks 3-12). Other positions and the NBA have no rule: their
  values do not use the schedule.
- The matchup labels keep their cut (8% above or below average) and the
  schedule columns theirs (3%). With steadier factors, far fewer games and
  schedules are labeled: only clear differences show.
- The analyzer's schedule tooltips say the schedule counts in the value for
  the positions that have a rule (DEF), and stay "information only" for the
  rest.

## Consequences

- The Good / Tough labels and the colored schedule cells become rare (in
  the product owner's league, the week's labels for relevant players went
  from 108 good / 100 tough to 12 / 11; playoff schedule colors from 116 /
  135 to 36 / 44). Most matchups are close to average, and now say so.
- Team defenses' values move toward the average and follow the schedule
  left, playoff weeks included. This changes their ranking in the lineup,
  free agency and leaders. Their trade value follows the same value.
- The weekly lineup, players' values and trade values do not change.
