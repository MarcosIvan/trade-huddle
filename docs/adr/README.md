# Architecture decision records

Each record explains one decision about the value model or the site: the
problem, the options considered, what was chosen and how it was checked.
New decisions get the next number; an old record is not rewritten when a
later one changes it, the later one says what it replaces.

| #                                             | Decision                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| [0001](0001-value-model-calibration.md)       | Calibrate the value model with a backtest                               |
| [0002](0002-positional-scarcity.md)           | Trade value as the headline number, with bench depth for scarcity       |
| [0003](0003-market-prior.md)                  | Use Sleeper's preseason projection as the prior                         |
| [0004](0004-teammate-returns.md)              | Teammates returning from injury (tested, not enabled)                   |
| [0005](0005-weekly-lineup.md)                 | Weekly lineup from Sleeper's weekly projection and our value            |
| [0006](0006-player-score-and-fair-trades.md)  | Player Score, fair-trade traffic light and match-based trade ideas      |
| [0007](0007-composite-trade-value.md)         | Composite trade value, value-first and position-balanced trade ideas    |
| [0008](0008-trade-finder.md)                  | Trade finder, refills and bench depth                                   |
| [0009](0009-content-security-policy.md)       | Content Security Policy by hash, in a meta tag                          |
| [0010](0010-market-calibrated-trade-value.md) | Trade value calibrated against the market, with a reputation lift       |
| [0011](0011-next-game-projection.md)          | Sleeper's next-game projection in the expected points                   |
| [0012](0012-player-news.md)                   | Player news from Sleeper, fetched when asked                            |
| [0013](0013-trade-value-scale.md)             | A flatter trade value scale, one injury discount and Sleeper's IR spots |
| [0014](0014-even-trade-ideas.md)              | Even trade ideas, no free agents and no ideal roster setting            |
| [0015](0015-player-card.md)                   | Player card with the season week by week and every matchup rated        |
| [0016](0016-npm-audit-production-only.md)      | npm audit blocks on production dependencies only                        |

How the pieces fit together: [architecture.md](../architecture.md).
