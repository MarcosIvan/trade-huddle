# Trade Huddle

[![CI](https://github.com/MarcosIvan/trade-huddle/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcosIvan/trade-huddle/actions/workflows/ci.yml)
[![CodeQL](https://github.com/MarcosIvan/trade-huddle/actions/workflows/codeql.yml/badge.svg)](https://github.com/MarcosIvan/trade-huddle/actions/workflows/codeql.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/MarcosIvan/trade-huddle/badge)](https://scorecard.dev/viewer/?uri=github.com/MarcosIvan/trade-huddle)

Trade ideas, a trade finder and a trade analyzer for **Sleeper redraft fantasy
football leagues**.

**Use it:** open **https://marcosivan.github.io/trade-huddle/**, type your
Sleeper username and pick a league. No sign-up, no
download. Want to look around first? Open the
[demo league](https://marcosivan.github.io/trade-huddle/?demo) (fictional data).

For your league, Trade Huddle:

1. **Builds your team**: your current roster, arranged into the best starting
   lineup for your league's slots, plus a **"This week"** lineup that uses each
   player's opponent.
2. **Suggests three trades** that make _your_ team and the partner's team
   better, stay fair for both sides and keep both rosters' positions balanced.
3. **Finds deals around one player** (trade finder): pick one of your players
   to sell, or one from another team to get, and see the best deals around him.
4. **Analyzes any trade you build**, player by player, with a fairness
   traffic light.

Every number is computed under **your league's own scoring rules**.

> Independent open-source project. Not affiliated with or endorsed by Sleeper.

---

## How it works

```
Every day at 10:00 UTC (GitHub Actions)             In the visitor's browser
───────────────────────────────────────             ─────────────────────────────
pipeline/ (Python)                                  web/ (Next.js static export)
  └─ Sleeper public API                               ├─ data/nfl/stats.json
       ├─ player directory                            ├─ Sleeper API (live):
       ├─ last season's totals, preseason             │    user → leagues → league,
       │  projections and draft ADP                   │    rosters, users
       ├─ this season, week by week                   ├─ score games with the
       └─ schedule and weekly projections             │  league's scoring rules
          ↓                                           ├─ value players, build lineups
     web/public/data/nfl/stats.json ── deployed ──►   └─ search and rate trades
     (raw stats, no league data)       to GitHub Pages     (in a Web Worker)
```

- The daily job only builds a **league-independent** stats file.
- Everything league-specific runs in the browser, straight against Sleeper's
  public API, so rosters are always current. A **Refresh rosters** button
  re-reads them after a trade.
- There is no server, no database, no login and **no API key**.

## How value works

Two numbers matter, and the design decisions behind them are recorded in
[`docs/adr/`](docs/adr).

**Points per game (Pts/g)**: expected points per game from here on, under your
league's scoring. It starts from Sleeper's preseason projection (or last
season) and moves toward this season's games as they pile up: the prior keeps
`8 / (8 + games)` of the weight, so 73% after 3 games and 50% after 8. Part of
each game's points comes from the targets and carries behind them, so a lucky
touchdown counts less. Calibrated with a backtest on 2024 and 2025
([ADR 0001](docs/adr/0001-value-model-calibration.md),
[ADR 0003](docs/adr/0003-market-prior.md)).

**Trade value (1 to 40, one decimal)**: what a player is worth in a trade. It
combines several measures, each compared across the league
([ADR 0007](docs/adr/0007-composite-trade-value.md)):

| Part                                              | Weight |
| ------------------------------------------------- | ------ |
| Proven base (preseason projection or last season) | 15     |
| Draft market (ADP; fades as games are played)     | 15     |
| Expected points per game                          | 15     |
| This season                                       | 10     |
| Last 3 games                                      | 10     |
| Edge over the average starter at his position     | 10     |
| Points above a free agent (scarcity)              | 10     |
| Share of his NFL offense's targets and carries    | 15     |

Scarce positions are scaled up (running backs, and quarterbacks in superflex),
injured players keep part of their value, and nobody goes below 1. The
**Player Score** (0-100, next to each name) adds how important the player is
to his fantasy team.

**Fairness** compares trade value on each side; a side's second and third
players count 85% and 70%, so two good players do not add up to a star.
Green is fair (90% or more), yellow could work (75-89%), red means don't.

## Trade ideas and the trade finder

A deal is suggested only if:

- **both teams get better**: starters plus bench depth (20% of what the best
  backup at each position scores above a free agent); starters may dip at most
  0.5 pts/game, and only when depth makes up for it;
- it is **at least 85% fair** and never costs you more than 10% of the trade
  value you send;
- **positions stay sound on both rosters**: every position you send comes
  back in the deal or is covered by a spare you already have, nobody is left
  short of starters, and nobody piles up a position (no third QB in a one-QB
  league). Kickers and defenses are not traded.
- it **respects your ideal roster**: how many QBs, RBs, WRs and TEs you want,
  bench included, at most 13 in total (2, 4, 5 and 2 by default in a one-flex
  league; in superflex one more QB and one fewer WR). Players on injured
  reserve don't count: each team has 3 IR spots outside the roster. From a
  fourth player on IR on, the extra ones take a roster spot and count (the
  least valuable first). You can change it with the − and + buttons above the
  trade ideas and press **Update trade ideas**. A deal may keep a position
  below or above the ideal as it is, but never takes it further away, and
  positions below the ideal count as needs when ranking. It is saved in your
  browser for each league and team.

Trade ideas only suggest the deals worth a second look:

- **1-for-1** at different positions (never RB for RB);
- **2-for-1 or 3-for-2**, either way: the side sending fewer players gets
  better ones, at positions the other side sends;
- **2-for-2 crossed**: a star and a depth player for a star and a depth
  player at the opposite positions (high RB + low TE for high TE + low RB);
- **2-for-2 consolidation**: two alike good players for a clearly better star
  and a depth player, or the other way round.

Two players of alike value for two others are left out. A roster with many
good players leans to packing them into stars; one with few leans to turning
a star into more good players. That is a preference in the ranking, not a
rule.

Trade ideas show **three** deals: fair first, then those where your starters
gain more than the partner's, then those in your roster's lean, then the best
matches (each side getting the best player at a position where it is weak).
When fewer than three deals pass, the nearest ones fill the list and say what
they are missing. The **trade finder** applies the same rules, shapes and
ranking around one player and also always shows three deals, starring every
true match ([ADR 0008](docs/adr/0008-trade-finder.md)).
The **trade analyzer** shows any deal in one card: fairness on top, then what
you send and what you receive, each with what it gains or loses in trade
value, points per game and the last 3 games (received minus sent).

## For developers

### Run it locally

Requirements: Python 3.12 and Node 22.

```bash
# 1. Build the stats file (writes web/public/data/nfl/stats.json)
python -m venv .venv
.venv/bin/pip install --require-hashes -r pipeline/requirements.txt
.venv/bin/pip install --no-deps -e pipeline
.venv/bin/python -m trade_huddle_data build

# 2. Run the site
cd web
npm ci
npm run dev                       # http://localhost:3000
```

The demo league works without the stats build: open
`http://localhost:3000/?demo`. To regenerate it: `python tools/make_demo.py`.

Checks, from `web/`: `npm run lint`, `npm run typecheck`, `npm test`,
`npm run format:check`, `npm run build` (which also adds the Content
Security Policy to every page, see
[ADR 0009](docs/adr/0009-content-security-policy.md)). End-to-end tests run
Playwright against that build, served like GitHub Pages, with Sleeper's API
mocked (hostile names included); each test fails on any CSP violation or page
error, and axe checks WCAG 2.1 AA in both themes:

```bash
npx playwright install chromium   # once
NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run build
NEXT_PUBLIC_BASE_PATH=/trade-huddle npm run test:e2e
```

The value model's backtests run with
`npm run backtest` (and `backtest:scarcity`, `backtest:teammates`,
`backtest:weekly`) after building the past seasons they use with
`python -m trade_huddle_data build --season 2024` (and `2025`). The pipeline's own checks
are in [`pipeline/README.md`](pipeline/README.md). The **CI** workflow
([`ci.yml`](.github/workflows/ci.yml)) runs all of them (except the
backtests), plus
`npm audit --audit-level=high` and a gitleaks scan of the git history for
secrets, on every pull request and every push to `main`. To check for
secrets before each commit too: `pip install pre-commit && pre-commit install`
(see [`.pre-commit-config.yaml`](.pre-commit-config.yaml)).

### Deploy your own copy

Not needed to use the site. If you want your own:

1. Fork the repository.
2. _Settings → Pages → Build and deployment → Source:_ **GitHub Actions**.
3. _Actions → Build and deploy → Run workflow_. After that it runs every day at
   10:00 UTC and on every push to `main`.
4. Open `https://<your-user>.github.io/<repo-name>/`.
5. Optional, to show up on Google: add the site to
   [Google Search Console](https://search.google.com/search-console) as a
   _URL prefix_ property, choose the **HTML tag** method and copy only the
   `content` value into a repository variable named
   `GOOGLE_SITE_VERIFICATION` (_Settings → Secrets and variables → Actions →
   Variables_). Run the workflow again, verify, then submit `sitemap.xml`.

The canonical link, link previews and `sitemap.xml` use the address GitHub
Pages reports, so a fork or a custom domain needs no code change.

The workflow needs no secrets.

### Optional: export to Google Sheets

`tools/sheets_export.py` writes a league's weekly stats and a per-player
summary to a Google Sheet. The website does not need it.

1. In Google Cloud, enable the **Google Sheets API** and **Google Drive API**,
   create a **service account**, and download its JSON key.
2. Save the key next to the project as `google-service-account.json`.
   It is git-ignored. **Never commit it.**
3. Share your sheet with the service account's `client_email` as an Editor.
4. Run (see [`.env.example`](.env.example)):

```bash
pip install -r tools/requirements-sheets.txt
export SLEEPER_LEAGUE_ID=your_league_id
export SPREADSHEET_ID=your_sheet_id
python tools/sheets_export.py
```

On Windows PowerShell use `$env:SLEEPER_LEAGUE_ID="..."` instead of `export`.

## Security

This repository is public on purpose, so it is built to contain nothing
sensitive. Details in [SECURITY.md](SECURITY.md).

## Limitations

- Built for **redraft** leagues. Dynasty and keeper leagues work, but age,
  future outlook and draft picks are ignored (the site shows a notice).
- **IDP** positions are not valued yet.
- Trade value weights are product choices checked against the market and real
  examples; only the points-per-game model is backtested.

## Project layout

```
web/                       the website (Next.js, React, TypeScript; static export)
  src/lib/model/           value model, lineups, trade search (plain TypeScript, tested)
  src/components/          React components
  scripts/backtest/        backtests of the value model
pipeline/                  stats builder (Python package, run by GitHub Actions)
tools/                     demo league generator, optional Google Sheets export
docs/adr/                  architecture decision records
docs/                      the original prototype (HTML/CSS/JS), kept as reference
.github/workflows/         build and deploy workflow
```

## License

[MIT](LICENSE)
