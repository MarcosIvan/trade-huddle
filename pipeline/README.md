# trade-huddle-data

Builds the league-independent stats file that the site reads, from Sleeper's
public API (no keys needed).

```bash
python -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/pip install --no-deps -e pipeline            # or -e "pipeline[dev]" for tests

.venv/bin/python -m trade_huddle_data build            # -> web/public/data/nfl/stats.json
.venv/bin/python -m trade_huddle_data build --season 2025   # a past season, for backtests
```

Run from the repository root. The player directory is cached in `.cache/` for
a day, as Sleeper asks.

## Output

Stat names are replaced by indexes into `keys` to keep the file small. Each
player has `n` (name), `p` (position), `fp` (fantasy positions), `t` (team),
optional `a` (age), `i` (injury) and `s` (status), `prev` (last season:
games and totals) and `w` (this season, by week). `tw` records the team the
player played for each week, and `team_weeks` holds each team's weekly
totals of `usage_keys` (targets, carries, red-zone targets), so the site can
compute a player's share of his team's offense even after a trade.

## Development

```bash
cd pipeline
../.venv/bin/ruff check . && ../.venv/bin/ruff format --check .
../.venv/bin/mypy src tests
../.venv/bin/pytest
```

`transform.py` holds pure functions (responses in, file out) and is where
the tests focus; `sleeper.py` is the only module that talks to the network.
