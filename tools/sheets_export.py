"""
Optional: export your league's weekly stats to a Google Sheet.

The website does not need this. It is a personal extra for people who like to
dig into the numbers in a spreadsheet.

Configuration comes ONLY from environment variables, so no personal IDs or
credentials ever live in the repository:

    SLEEPER_LEAGUE_ID        your Sleeper league ID
    SPREADSHEET_ID           the ID in your Google Sheet's URL
    GOOGLE_CREDENTIALS_FILE  path to your service account JSON
                             (default: google-service-account.json, git-ignored)

    pip install -r requirements-sheets.txt
    python tools/sheets_export.py

Two tabs are created or replaced:
    "Weekly Stats"  one row per player per week
    "Summary"       one row per player (averages, recent form, trend, owner)
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
import gspread
from google.oauth2.service_account import Credentials


# ============================================================
# Settings
# ============================================================

SLEEPER_LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID", "").strip()
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID", "").strip()
GOOGLE_CREDENTIALS_FILE = os.getenv("GOOGLE_CREDENTIALS_FILE", "google-service-account.json")

WEEKLY_TAB = "Weekly Stats"
SUMMARY_TAB = "Summary"

# Local cache of /players/nfl (Sleeper asks for at most one call per day).
PLAYERS_CACHE_FILE = Path(".cache") / "players_nfl.json"

# Add "DL", "LB", "DB" if your league uses IDP.
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}

RECENT_GAMES = 3
FREE_AGENT_LABEL = "Free agent"

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

SLEEPER_API = "https://api.sleeper.app/v1"
SLEEPER_STATS_API = "https://api.sleeper.com/stats/nfl"


# ============================================================
# Google Sheets
# ============================================================

def connect_spreadsheet():
    credentials = Credentials.from_service_account_file(
        GOOGLE_CREDENTIALS_FILE, scopes=GOOGLE_SCOPES
    )
    return gspread.authorize(credentials).open_by_key(SPREADSHEET_ID)


def get_or_create_worksheet(spreadsheet, title):
    try:
        return spreadsheet.worksheet(title)
    except gspread.WorksheetNotFound:
        return spreadsheet.add_worksheet(title=title, rows=1000, cols=50)


# ============================================================
# Sleeper API
# ============================================================

def sleeper_get(url, params=None):
    response = requests.get(url, params=params, timeout=60)
    response.raise_for_status()
    return response.json()


def get_players():
    """Downloads the full player directory at most once a day."""
    if PLAYERS_CACHE_FILE.exists():
        modified = datetime.fromtimestamp(PLAYERS_CACHE_FILE.stat().st_mtime, tz=timezone.utc)
        if (datetime.now(timezone.utc) - modified).total_seconds() < 24 * 3600:
            with PLAYERS_CACHE_FILE.open("r", encoding="utf-8") as f:
                return json.load(f)

    print("Downloading Sleeper player directory...")
    players = sleeper_get(f"{SLEEPER_API}/players/nfl")
    PLAYERS_CACHE_FILE.parent.mkdir(exist_ok=True)
    with PLAYERS_CACHE_FILE.open("w", encoding="utf-8") as f:
        json.dump(players, f, ensure_ascii=False)
    return players


def get_weekly_stats(season, week):
    """Returns {player_id: entry}. The endpoint returns a list of entries."""
    data = sleeper_get(f"{SLEEPER_STATS_API}/{season}/{week}", params={"season_type": "regular"})
    if isinstance(data, dict):
        return {str(pid): {"player_id": str(pid), "stats": s} for pid, s in data.items()}
    return {str(e["player_id"]): e for e in data if e and e.get("player_id")}


def build_owner_map(rosters, users):
    """Returns {player_id: fantasy team name}."""
    names = {}
    for user in users:
        meta = user.get("metadata") or {}
        names[user.get("user_id")] = meta.get("team_name") or user.get("display_name") or ""
    owners = {}
    for roster in rosters:
        owner = names.get(roster.get("owner_id")) or f"Roster {roster.get('roster_id')}"
        for pid in roster.get("players") or []:
            owners[str(pid)] = owner
    return owners


# ============================================================
# Rows
# ============================================================

STAT_FIELDS = [
    "pass_cmp", "pass_att", "pass_yd", "pass_td", "pass_int",
    "rush_att", "rush_yd", "rush_td",
    "rec", "rec_tgt", "rec_yd", "rec_td",
    "fum", "fum_lost", "pass_2pt", "rush_2pt", "rec_2pt", "st_td",
    "fgm", "fga", "xpm",
    "def_td", "sack", "int", "fum_rec", "pts_allow", "yds_allow",
]


def league_points(stats, scoring):
    """Points under YOUR league's rules: sum of stat x weight."""
    total = 0.0
    for key, weight in scoring.items():
        value = stats.get(key)
        if isinstance(value, (int, float)) and isinstance(weight, (int, float)):
            total += value * weight
    return round(total, 2)


def build_rows(players, weekly, season, week, scoring, owners):
    rows = []
    for pid, entry in weekly.items():
        stats = entry.get("stats") or {}
        embedded = entry.get("player") or {}
        cached = players.get(pid, {})
        fantasy_positions = embedded.get("fantasy_positions") or cached.get("fantasy_positions") or []
        if not FANTASY_POSITIONS.intersection(fantasy_positions):
            continue
        if not stats.get("gp") and not stats.get("pts_ppr"):
            continue
        first = embedded.get("first_name") or cached.get("first_name") or ""
        last = embedded.get("last_name") or cached.get("last_name") or ""
        row = {
            "season": season,
            "week": week,
            "player_id": pid,
            "player_name": cached.get("full_name") or f"{first} {last}".strip(),
            "position": embedded.get("position") or cached.get("position") or "",
            "fantasy_positions": ",".join(fantasy_positions),
            "team": entry.get("team") or embedded.get("team") or "",
            "opponent": entry.get("opponent") or "",
            "owner": owners.get(pid, FREE_AGENT_LABEL),
            "pts_league": league_points(stats, scoring),
            "pts_std": stats.get("pts_std", 0),
            "pts_half_ppr": stats.get("pts_half_ppr", 0),
            "pts_ppr": stats.get("pts_ppr", 0),
        }
        for field in STAT_FIELDS:
            row[field] = stats.get(field, 0)
        rows.append(row)
    return rows


def _avg(values):
    return round(sum(values) / len(values), 2) if values else 0


def build_summary(rows, players, owners):
    by_player = {}
    for row in rows:
        by_player.setdefault(row["player_id"], []).append(row)

    summary = []
    for pid, games in by_player.items():
        games.sort(key=lambda r: r["week"])
        last = games[-1]
        points = [g["pts_league"] for g in games]
        recent_games = games[-RECENT_GAMES:]
        season_avg = _avg(points)
        recent_avg = _avg(points[-RECENT_GAMES:])
        cached = players.get(pid, {})
        summary.append({
            "player_id": pid,
            "player_name": last["player_name"],
            "position": last["position"],
            "team": cached.get("team") or last["team"],
            "owner": owners.get(pid, FREE_AGENT_LABEL),
            "injury": cached.get("injury_status") or "",
            "games": len(games),
            "pts_total": round(sum(points), 2),
            "avg_season": season_avg,
            f"avg_last_{RECENT_GAMES}": recent_avg,
            "trend": round(recent_avg - season_avg, 2),
            "last_game_pts": points[-1],
            "last_game_week": last["week"],
            "best_week": max(points),
            "worst_week": min(points),
            f"targets_last_{RECENT_GAMES}": _avg([g.get("rec_tgt") or 0 for g in recent_games]),
            f"carries_last_{RECENT_GAMES}": _avg([g.get("rush_att") or 0 for g in recent_games]),
        })

    by_pos = {}
    for item in summary:
        by_pos.setdefault(item["position"], []).append(item)
    for items in by_pos.values():
        for rank, item in enumerate(sorted(items, key=lambda x: -x["avg_season"]), 1):
            item["pos_rank_season"] = rank
        for rank, item in enumerate(sorted(items, key=lambda x: -x[f"avg_last_{RECENT_GAMES}"]), 1):
            item[f"pos_rank_last_{RECENT_GAMES}"] = rank

    order = {"QB": 0, "RB": 1, "WR": 2, "TE": 3, "K": 4, "DEF": 5}
    summary.sort(key=lambda x: (order.get(x["position"], 9), -x[f"avg_last_{RECENT_GAMES}"]))
    return summary


WEEKLY_COLUMNS = [
    "season", "week", "player_id", "player_name", "position", "fantasy_positions",
    "team", "opponent", "owner", "pts_league", "pts_std", "pts_half_ppr", "pts_ppr",
] + STAT_FIELDS

SUMMARY_COLUMNS = [
    "player_name", "position", "team", "owner", "injury", "games", "pts_total",
    "avg_season", f"avg_last_{RECENT_GAMES}", "trend",
    "pos_rank_season", f"pos_rank_last_{RECENT_GAMES}",
    "last_game_pts", "last_game_week", "best_week", "worst_week",
    f"targets_last_{RECENT_GAMES}", f"carries_last_{RECENT_GAMES}", "player_id",
]


def write_table(worksheet, columns, rows):
    values = [columns] + [
        ["" if row.get(c) is None else row.get(c, 0) for c in columns] for row in rows
    ]
    worksheet.clear()
    # The sheet must be big enough, or Sheets rejects the write ("exceeds grid limits").
    worksheet.resize(rows=len(values) + 10, cols=len(columns))
    chunk = 5000
    for start in range(0, len(values), chunk):
        worksheet.update(range_name=f"A{start + 1}", values=values[start:start + chunk])
    worksheet.freeze(rows=1)
    try:
        worksheet.set_basic_filter()
        worksheet.columns_auto_resize(0, len(columns) - 1)
    except Exception:
        pass


# ============================================================
# Main
# ============================================================

def main():
    missing = [n for n, v in (("SLEEPER_LEAGUE_ID", SLEEPER_LEAGUE_ID), ("SPREADSHEET_ID", SPREADSHEET_ID)) if not v]
    if missing:
        sys.exit(f"Set these environment variables first: {', '.join(missing)}")
    if not Path(GOOGLE_CREDENTIALS_FILE).is_file():
        sys.exit(f"Service account file not found: {GOOGLE_CREDENTIALS_FILE}")

    league = sleeper_get(f"{SLEEPER_API}/league/{SLEEPER_LEAGUE_ID}")
    season = str(league.get("season"))
    scoring = league.get("scoring_settings") or {}
    print(f"League: {league.get('name')} ({season})")

    owners = build_owner_map(
        sleeper_get(f"{SLEEPER_API}/league/{SLEEPER_LEAGUE_ID}/rosters"),
        sleeper_get(f"{SLEEPER_API}/league/{SLEEPER_LEAGUE_ID}/users"),
    )

    state = sleeper_get(f"{SLEEPER_API}/state/nfl")
    if str(state.get("season")) == season and state.get("season_type") == "regular":
        last_week = min(int(state.get("week") or 1), 18)
    elif str(state.get("season")) == season and state.get("season_type") == "pre":
        last_week = 0
    else:
        last_week = 18
    if last_week == 0:
        print("The regular season has not started yet.")
        return

    players = get_players()
    rows = []
    for week in range(1, last_week + 1):
        print(f"  Week {week}...")
        rows.extend(build_rows(players, get_weekly_stats(season, week), season, week, scoring, owners))
    summary = build_summary(rows, players, owners)
    print(f"{len(rows)} weekly rows, {len(summary)} players.")

    spreadsheet = connect_spreadsheet()
    write_table(get_or_create_worksheet(spreadsheet, WEEKLY_TAB), WEEKLY_COLUMNS, rows)
    write_table(get_or_create_worksheet(spreadsheet, SUMMARY_TAB), SUMMARY_COLUMNS, summary)
    print("Google Sheet updated.")


if __name__ == "__main__":
    main()
