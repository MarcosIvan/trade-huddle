# Architecture

Trade Huddle is a static website with no backend. Everything league-specific
happens in the visitor's browser; the only server-side work is a daily job
that builds a public stats file.

```
                 GitHub Actions (daily, 10:00 UTC, and on every push to main)
                ┌───────────────────────────────────────────────────────────┐
 Sleeper API ──▶│ pipeline/  (Python) ──▶ web/public/data/<sport>/stats.json│
 (public, no    │ web/       (Next.js static export + CSP by hash)          │
  keys)         └──────────────────────────────┬────────────────────────────┘
                                               ▼
                                         GitHub Pages
                                               │
                                               ▼
                 Browser: Sleeper API (user, leagues, rosters) + stats.json
                          ──▶ value model ──▶ lineups, trade ideas, analyzer
```

## Two halves

### 1. The stats pipeline (`pipeline/`)

A small Python package, `trade_huddle_data`, run by the deploy workflow
([`deploy.yml`](../.github/workflows/deploy.yml)). It reads Sleeper's public
API and writes one **league-independent** file per sport, `data/nfl/stats.json`
and `data/nba/stats.json` (the NBA one by game day,
[ADR 0019](adr/0019-nba-data-by-game-day.md)):

- every relevant player's weekly stats this season, and last season's totals;
- the team each player played for each week, and each team's weekly usage
  totals (targets, carries, red-zone targets), so shares survive trades;
- Sleeper's preseason and weekly projections, and draft-market ADP.

It knows nothing about any league's scoring. Stat names are replaced by
indexes to keep the file small. Details and output format:
[`pipeline/README.md`](../pipeline/README.md).

### 2. The website (`web/`)

Next.js with React and TypeScript, exported as plain static files
(`next build` → `web/out`) and served by GitHub Pages. After the build,
[`scripts/csp.mjs`](../web/scripts/csp.mjs) adds a Content Security Policy
with the hash of every inline script to each page
([ADR 0009](adr/0009-content-security-policy.md)).

## What happens in the browser

1. **Entry.** The visitor types a Sleeper username. The site calls Sleeper's
   public API directly (`/user/<name>`, `/state/nfl`,
   `/user/<id>/leagues/nfl/<season>`) and lists the leagues
   ([`lib/sleeper/client.ts`](../web/src/lib/sleeper/client.ts)).
2. **League.** For the chosen league it fetches the settings, rosters and
   users. Every response is checked against the expected shape before use
   ([`lib/sleeper/validate.ts`](../web/src/lib/sleeper/validate.ts)).
3. **Stats.** It loads `stats.json` from the same site
   ([`lib/stats.ts`](../web/src/lib/stats.ts)). The demo league (`?demo`)
   loads a fictional league and stats file from the site instead, with no
   calls to Sleeper.
4. **Model.** [`buildModel`](../web/src/lib/model/build.ts) scores every
   player under the league's own scoring and slots, then derives value, trade
   value, Player Score and the weekly outlook (see below).
5. **Trade search.** Trade ideas and the trade finder run in a Web Worker
   ([`workers/trades.worker.ts`](../web/src/workers/trades.worker.ts)) so
   the page never freezes; players cross the worker boundary as IDs
   ([`lib/tradeSearch.ts`](../web/src/lib/tradeSearch.ts)).
6. **News.** The newspaper icon beside a player's name asks Sleeper for that
   player's latest news (`/players/<sport>/<id>/news`) only when clicked
   ([ADR 0012](adr/0012-player-news.md), [`components/News.tsx`](../web/src/components/News.tsx)).
7. **Player card.** Clicking a player's name opens his season totals and
   rank, his season week by week and his schedule, built in the browser from the stats file
   ([ADR 0015](adr/0015-player-card.md), [`lib/model/playerCard.ts`](../web/src/lib/model/playerCard.ts),
   [`components/PlayerCard.tsx`](../web/src/components/PlayerCard.tsx)).
8. **Storage.** Only small preferences are kept, in the visitor's own
   `localStorage` (username, last league, theme),
   and every access is guarded ([`lib/storage.ts`](../web/src/lib/storage.ts)).

Nothing is sent anywhere except the read-only calls to Sleeper.

## The value model (`web/src/lib/model/`)

Plain TypeScript, no React and no DOM, so it is easy to test and to run in a
worker. The main pieces, in the order they are used:

| File             | Role                                                                                           |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `scoring.ts`     | Fantasy points = sum of stat × league weight                                                   |
| `usage.ts`       | Expected points from opportunity (targets, carries)                                            |
| `value.ts`       | Points per game from here on: production, prior, availability                                  |
| `teammates.ts`   | Adjustment when a key teammate returns (tested, off: [ADR 0004](adr/0004-teammate-returns.md)) |
| `replacement.ts` | Replacement level per position for this league                                                 |
| `lineup.ts`      | Best starting lineup for the league's slots                                                    |
| `score.ts`       | Trade value (1–40) and Player Score (0–100)                                                    |
| `verdict.ts`     | Fairness of a trade (the traffic light)                                                        |
| `trades.ts`      | Trade ideas and the trade finder                                                               |
| `analyzer.ts`    | What the analyzer says about a trade: each side's change, free agents for uneven trades        |
| `weekly.ts`      | This week's outlook against the opponent                                                       |
| `weekLineup.ts`  | This week's best lineup, bench and injured reserve                                             |
| `matchup.ts`     | Good, neutral or tough matchup, and its tooltip                                                |
| `playerCard.ts`  | The player card: season game by game, stat colors, season rank                                 |

Why each piece works the way it does is recorded in the
[architecture decision records](adr/README.md).

## The interface (`web/src/components/`)

React components that only render: every calculation comes from
`lib/model` (or `lib/` for Sleeper, news and storage), and each component
has its own CSS Module. Pieces shared across the page live in their own
files ([ADR 0018](adr/0018-front-components.md)):

- `Modal` and `ModalHeader`: the one dialog behind the player card and the
  news (Escape, backdrop click and the close button all close it);
- `MatchupBadge`: the Good / Neutral / Tough badge of the weekly lineup and
  the player card;
- `Player` (`PlayerCell`, `PosBadge`, `TradeValue`…), `Section`,
  `BalanceMeter`: the building blocks of every list and card.

Bigger screens are split by part: the player card is `PlayerCard`
(provider and clickable name), `PlayerCardPanel` (totals and rank) and
`GameLog` (the season table); the analyzer is `TradeAnalyzer`, `PickList`
and `TradeSide`; the league header's `LeaguePicker` has its own file.

## Tests and checks

- **Unit tests** (Vitest) for the model, the league logic and the response
  validators, plus a few component tests (shared components rendered to
  HTML with `react-dom/server`); a reference test makes sure the TypeScript model reproduces the
  original prototype on the demo league.
- **End-to-end tests** (Playwright) against the real static build, with
  Sleeper's API mocked. They fail on any CSP violation or page error and run
  axe (WCAG 2.1 AA) in both themes.
- **Backtests** (`web/scripts/backtest/`) measure the model against past
  seasons; they are run by hand, not in CI.
- **Pipeline checks**: pytest, ruff and mypy.
- **CI** ([`ci.yml`](../.github/workflows/ci.yml)) runs everything except the
  backtests, plus `npm audit` (blocking for what ships in the site, a warning
  for dev tools, [ADR 0016](adr/0016-npm-audit-production-only.md)) and a gitleaks scan. CodeQL and OpenSSF
  Scorecard run in their own workflows. Actions are pinned by commit SHA.

## Design choices at a glance

- **No backend, no accounts, no keys.** Nothing to breach and nothing to pay
  for; any fork can deploy its own copy with no secrets.
- **One shared stats file.** Heavy, league-independent work runs once a day;
  league-specific work is cheap enough for the browser.
- **The model is framework-free.** It can be tested, backtested and moved to a
  worker without touching the UI.
- **Sport-agnostic edges.** Sport details live in
  [`lib/sports/`](../web/src/lib/sports/) (`nfl.ts`, `nba.ts`) and the
  pipeline's `sports.py`, so another sport can be added without rewriting the
  model. The league's sport picks the config (`sportOf`), and components read
  it from a `SportContext`; a stats file's entries are weeks or game days
  (`lib/model/periods.ts`, [ADR 0020](adr/0020-nba-model-and-sport-per-league.md)).
