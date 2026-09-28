# Trade Huddle

Trade ideas and a trade analyzer for **Sleeper redraft fantasy football leagues**.

Enter your Sleeper username, pick a league, and Trade Huddle:

1. **Builds your team**: your current Sleeper roster, arranged into the best
   starting lineup for your league's slots.
2. **Suggests up to three trades** that raise the expected points of *your*
   starters **and** your trade partner's starters, so they have a real chance of
   being accepted.
3. **Analyzes the balance** of any trade you build, player by player.

Player value blends what a player has **already proven** (last season) with
what he is doing **right now** (this season and his last three games), under
your league's own scoring rules. See [How value works](#how-value-works).

> Independent open-source project. Not affiliated with or endorsed by Sleeper.

---

## How it works

```
Every Tuesday (GitHub Actions)                       In the visitor's browser
────────────────────────────                         ───────────────────────────
build_data.py                                        docs/index.html + app.js
  └─ Sleeper public API                                ├─ data/stats.json
       ├─ player directory                             ├─ Sleeper API (live):
       ├─ last season's totals                         │    user → leagues → league,
       └─ this season, week by week                    │    rosters, users
          ↓                                            ├─ score games with the
     docs/data/stats.json  ──── deployed to ────────►  │  league's scoring rules
     (raw stats, no league data)   GitHub Pages        ├─ value players, build lineups
                                                       └─ search and rate trades
```

- The weekly job only builds a **league-independent** stats file.
- Everything league-specific runs in the browser, straight against Sleeper's
  public API, so rosters are always current (even trades made mid-week).
- There is no server, no database, no login and **no API key**.

## How value works

**Value** = expected points per game from here on, under your league's scoring.

| Ingredient | Weight |
|---|---|
| Last season's points per game | 60% at the start of the season, minus 8 points per game played this season, never below 10% |
| This season's average | 45% of the remaining weight |
| Last 3 games | 55% of the remaining weight |

Examples: after 1 game, 52% / 22% / 26%; after 3 games, 36% / 29% / 35%;
after 8 games, 10% / 40% / 50%.

- Rookies and players with little history start near **replacement level** and
  move away from it as they play.
- Players on IR count at half value and are never started. Players listed as
  Out lose 10%.
- **Replacement level** is what the best free agent would score after every
  team in the league fills its starting slots.
- **Above replacement** (value minus replacement level) is the currency for
  trade balance, so scarce positions are worth more.
- **Trade ideas** test every 1-for-1, 2-for-1, 1-for-2 and 2-for-2 deal with
  every team. A deal is shown only if it raises your starters by at least
  0.3 pts/game, also raises the partner's starters, and keeps both sides within
  25% of each other in value.

All weights live at the top of [`docs/app.js`](docs/app.js) in the `CFG` object.

## Deploy your own copy

1. **Create the repository** on GitHub (public) and push this code to `main`.
2. **Turn on Pages:** *Settings → Pages → Build and deployment → Source:*
   **GitHub Actions**.
3. **Run the first deploy:** *Actions → Build and deploy → Run workflow*.
   After that it runs by itself every Tuesday at 12:00 UTC and on every push
   to `main`.
4. Open `https://<your-user>.github.io/<repo-name>/`.

Nothing else to configure: the workflow needs no secrets.

## Run it locally

```bash
pip install -r requirements.txt
python build_data.py                  # writes docs/data/stats.json
python -m http.server 8000 -d docs    # open http://localhost:8000
```

Want to try it without calling Sleeper? The demo league is already in the repo:
open `http://localhost:8000/?demo`. To regenerate it: `python tools/make_demo.py`.

## Optional: export to Google Sheets

`tools/sheets_export.py` writes your league's weekly stats and a per-player
summary to a Google Sheet. The website does not need it.

1. In Google Cloud, enable the **Google Sheets API** and **Google Drive API**,
   create a **service account**, and download its JSON key.
2. Save the key next to the project as `google-service-account.json`.
   It is git-ignored. **Never commit it.**
3. Share your sheet with the service account's `client_email` as an Editor.
4. Run:

```bash
pip install -r requirements-sheets.txt
export SLEEPER_LEAGUE_ID=your_league_id
export SPREADSHEET_ID=your_sheet_id
python tools/sheets_export.py
```

On Windows PowerShell use `$env:SLEEPER_LEAGUE_ID="..."` instead of `export`.

## Security

This repository is public on purpose, so it is built to contain nothing
sensitive. Details in [SECURITY.md](SECURITY.md). In short:

- No secrets anywhere; `.gitignore` blocks credential files and `.env`.
- Strict Content Security Policy, escaped output, validated input.
- The workflow runs with a read-only token and never on pull requests from forks.

Recommended repository settings (*Settings → Code security* and *Settings → Actions*):

- [ ] **Secret scanning** and **Push protection**: blocks pushes that contain keys.
- [ ] **Dependabot alerts** and **security updates**.
- [ ] **Private vulnerability reporting**.
- [ ] **Branch protection** on `main`: require a pull request before merging.
- [ ] *Actions → General → Workflow permissions:* **Read repository contents**.
- [ ] *Actions → General → Fork pull request workflows:* **Require approval for all outside collaborators**.

## Limitations

- Built for **redraft** leagues. Dynasty and keeper leagues work, but age,
  future outlook and draft picks are ignored (the site shows a notice).
- **IDP** positions are not valued yet.
- Value comes from production only; it does not use projections, bye weeks or
  schedule strength.

## Project layout

```
build_data.py              weekly stats builder (run by GitHub Actions)
docs/                      the website (served by GitHub Pages)
  index.html, styles.css, app.js
  data/demo_*.json         fictional demo league
tools/make_demo.py         regenerates the demo league
tools/sheets_export.py     optional Google Sheets export
.github/workflows/         build and deploy workflow
```

## License

[MIT](LICENSE)
