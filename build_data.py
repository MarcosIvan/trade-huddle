"""
Builds the stats file the site reads (docs/data/stats.json).

Runs every Tuesday through GitHub Actions, after Monday Night Football.

The output is league-independent: it stores raw stats for every player
(last season's totals plus each week of the current season). The site applies
each league's own scoring rules on top of it, in the browser.

No API keys are needed: the Sleeper API is public and read-only.
"""

import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests


SLEEPER_API = "https://api.sleeper.app/v1"
SLEEPER_STATS_API = "https://api.sleeper.com/stats/nfl"

OUTPUT_FILE = Path(__file__).resolve().parent / "docs" / "data" / "stats.json"

# Positions the site supports (IDP leagues are not supported yet).
FANTASY_POSITIONS = {"QB", "RB", "WR", "TE", "K", "DEF"}

REGULAR_SEASON_WEEKS = 18

# Stats that never appear in scoring rules (rates, ranks, snaps, precomputed
# fantasy points). Dropping them keeps the file much smaller.
EXCLUDE_EXACT = {
    "gp", "gs", "gms_active",
    "pts_std", "pts_ppr", "pts_half_ppr", "pts_idp",
    "cmp_pct", "pass_rtg", "fgm_pct", "xp_pct",
}
EXCLUDE_PREFIXES = ("pos_rank_", "tm_", "fan_pts_allow", "idp_", "opp_")
EXCLUDE_SUFFIXES = (
    "_snp", "_pct", "_ypa", "_ypc", "_ypr", "_ypt", "_lng",
    "_rtg", "_air_yd", "_yar", "_yac", "_per_play",
)

session = requests.Session()
session.headers["User-Agent"] = "trade-huddle-data-builder"


# ============================================================
# Sleeper API
# ============================================================

def sleeper_get(url, params=None, retries=3):
    for attempt in range(retries):
        try:
            response = session.get(url, params=params, timeout=90)
            response.raise_for_status()
            return response.json()
        except requests.RequestException:
            if attempt == retries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def to_entries(data):
    """The stats endpoint returns a list; the older dict format is accepted too."""
    if isinstance(data, dict):
        return [{"player_id": pid, "stats": stats} for pid, stats in data.items()]
    return [e for e in (data or []) if isinstance(e, dict) and e.get("player_id")]


def get_week(season, week):
    return to_entries(
        sleeper_get(
            f"{SLEEPER_STATS_API}/{season}/{week}",
            params={"season_type": "regular"},
        )
    )


def played(stats):
    return bool(stats.get("gp")) or bool(stats.get("pts_ppr")) or bool(stats.get("pts_std"))


def get_season_totals(season):
    """
    Full-season totals per player.
    Tries the season endpoint first; falls back to summing all 18 weeks.
    """
    try:
        entries = to_entries(
            sleeper_get(
                f"{SLEEPER_STATS_API}/{season}",
                params={"season_type": "regular"},
            )
        )
        if entries and any((e.get("stats") or {}).get("gp") for e in entries):
            return {str(e["player_id"]): e.get("stats") or {} for e in entries}
    except requests.RequestException:
        pass

    print(f"  Summing {season} week by week...")
    totals = {}
    for week in range(1, REGULAR_SEASON_WEEKS + 1):
        for entry in get_week(season, week):
            stats = entry.get("stats") or {}
            if not played(stats):
                continue
            acc = totals.setdefault(str(entry["player_id"]), {})
            for key, value in stats.items():
                if isinstance(value, (int, float)):
                    acc[key] = acc.get(key, 0) + value
            if not stats.get("gp"):
                acc["gp"] = acc.get("gp", 0) + 1
    return totals


# ============================================================
# Transformation
# ============================================================

def keep_key(key):
    if key in EXCLUDE_EXACT:
        return False
    if key.startswith(EXCLUDE_PREFIXES):
        return False
    if key.endswith(EXCLUDE_SUFFIXES):
        return False
    return True


class KeyIndex:
    """Replaces stat names with integer indexes to shrink the JSON."""

    def __init__(self):
        self.keys = []
        self.index = {}

    def pack(self, stats):
        packed = []
        for key, value in sorted(stats.items()):
            if not isinstance(value, (int, float)) or value == 0 or not keep_key(key):
                continue
            if key not in self.index:
                self.index[key] = len(self.keys)
                self.keys.append(key)
            packed.extend([self.index[key], round(value, 2)])
        return packed


def player_info(meta):
    info = {
        "n": meta.get("full_name")
        or f"{meta.get('first_name', '')} {meta.get('last_name', '')}".strip(),
        "p": meta.get("position") or "",
        "fp": [p for p in (meta.get("fantasy_positions") or []) if p in FANTASY_POSITIONS],
        "t": meta.get("team") or "",
    }
    if meta.get("age"):
        info["a"] = meta["age"]
    if meta.get("injury_status"):
        info["i"] = meta["injury_status"]
    if meta.get("status") and meta.get("status") != "Active":
        info["s"] = meta["status"]
    return info


def is_fantasy_player(meta):
    return bool(FANTASY_POSITIONS.intersection(meta.get("fantasy_positions") or []))


# ============================================================
# Main
# ============================================================

def main():
    state = sleeper_get(f"{SLEEPER_API}/state/nfl")
    season = str(state.get("league_season") or state.get("season"))
    prev_season = str(int(season) - 1)
    season_type = state.get("season_type")

    if season_type == "pre":
        last_week = 0
    elif season_type == "regular" and str(state.get("season")) == season:
        last_week = min(int(state.get("week") or 1), REGULAR_SEASON_WEEKS)
    else:
        last_week = REGULAR_SEASON_WEEKS

    print(f"Season {season} ({season_type}), weeks 1-{last_week}")

    print("Downloading player directory...")
    all_players = sleeper_get(f"{SLEEPER_API}/players/nfl")

    keys = KeyIndex()
    players = {}

    def ensure(pid):
        pid = str(pid)
        if pid not in players:
            players[pid] = player_info(all_players.get(pid) or {})
        return players[pid]

    # Every fantasy-relevant player on a team, so rosters show names even for
    # players who have not played yet this season.
    for pid, meta in all_players.items():
        if is_fantasy_player(meta) and (meta.get("team") or meta.get("active")):
            ensure(pid)

    print(f"Last season ({prev_season})...")
    for pid, stats in get_season_totals(prev_season).items():
        meta = all_players.get(pid) or {}
        games = int(stats.get("gp") or 0)
        if not is_fantasy_player(meta) or games == 0:
            continue
        ensure(pid)["prev"] = {"g": games, "s": keys.pack(stats)}

    weeks_with_games = []
    for week in range(1, last_week + 1):
        print(f"Week {week}...")
        count = 0
        for entry in get_week(season, week):
            pid = str(entry["player_id"])
            stats = entry.get("stats") or {}
            meta = all_players.get(pid) or {}
            if not is_fantasy_player(meta) or not played(stats):
                continue
            ensure(pid).setdefault("w", {})[str(week)] = keys.pack(stats)
            count += 1
        if count:
            weeks_with_games.append(week)

    players = {
        pid: p for pid, p in players.items()
        if p["fp"] and (p.get("prev") or p.get("w") or p["t"])
    }

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "season": season,
        "prev_season": prev_season,
        "weeks": weeks_with_games,
        "keys": keys.keys,
        "players": players,
    }

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = OUTPUT_FILE.stat().st_size / 1_000_000
    print(
        f"Done: {len(players)} players, weeks {weeks_with_games}, "
        f"{len(keys.keys)} stat keys, {size_mb:.1f} MB -> {OUTPUT_FILE}"
    )


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as error:
        print(f"Could not reach Sleeper: {error}", file=sys.stderr)
        sys.exit(1)
