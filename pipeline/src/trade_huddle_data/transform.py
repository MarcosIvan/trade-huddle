"""Pure functions: Sleeper responses in, the compact stats file out. No network, no files."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any, TypeGuard

from .sports import SportConfig

Entry = dict[str, Any]
Stats = Mapping[str, Any]
Packed = list[float]


def to_entries(data: Any) -> list[Entry]:
    """The stats endpoints return a list of entries; the older dict format is accepted too."""
    if isinstance(data, dict):
        return [{"player_id": str(pid), "stats": stats} for pid, stats in data.items()]
    return [e for e in (data or []) if isinstance(e, dict) and e.get("player_id")]


def played(stats: Stats) -> bool:
    return bool(stats.get("gp") or stats.get("pts_ppr") or stats.get("pts_std"))


def keep_key(key: str, sport: SportConfig) -> bool:
    return not (
        key in sport.exclude_exact
        or key.startswith(sport.exclude_prefixes)
        or key.endswith(sport.exclude_suffixes)
    )


def is_number(value: Any) -> TypeGuard[float]:
    return isinstance(value, int | float) and not isinstance(value, bool)


class KeyIndex:
    """Replaces stat names with integer indexes to shrink the JSON."""

    def __init__(self, sport: SportConfig) -> None:
        self.sport = sport
        self.keys: list[str] = []
        self._index: dict[str, int] = {}

    def pack(self, stats: Stats) -> Packed:
        packed: Packed = []
        for key, value in sorted(stats.items()):
            if not is_number(value) or value == 0 or not keep_key(key, self.sport):
                continue
            if key not in self._index:
                self._index[key] = len(self.keys)
                self.keys.append(key)
            packed.extend([self._index[key], round(value, 2)])
        return packed


def is_fantasy_player(meta: Mapping[str, Any], sport: SportConfig) -> bool:
    return bool(sport.fantasy_positions.intersection(meta.get("fantasy_positions") or []))


def player_info(meta: Mapping[str, Any], sport: SportConfig, *, current: bool) -> dict[str, Any]:
    """
    Name, position and eligibility. Team, age, injury and status describe the
    player today, so they are only included for the current season.
    """
    name = meta.get("full_name") or (
        f"{meta.get('first_name') or ''} {meta.get('last_name') or ''}".strip()
    )
    info: dict[str, Any] = {
        "n": name,
        "p": meta.get("position") or "",
        "fp": [p for p in meta.get("fantasy_positions") or [] if p in sport.fantasy_positions],
        "t": (meta.get("team") or "") if current else "",
    }
    if current:
        if meta.get("age"):
            info["a"] = meta["age"]
        if meta.get("injury_status"):
            info["i"] = meta["injury_status"]
        if meta.get("status") and meta.get("status") != "Active":
            info["s"] = meta["status"]
    return info


def sum_weeks(weeks: Iterable[list[Entry]]) -> dict[str, dict[str, float]]:
    """Season totals by adding up weekly stats (fallback when the season endpoint fails)."""
    totals: dict[str, dict[str, float]] = {}
    for entries in weeks:
        for entry in entries:
            stats = entry.get("stats") or {}
            if not played(stats):
                continue
            acc = totals.setdefault(str(entry["player_id"]), {})
            for key, value in stats.items():
                if is_number(value):
                    acc[key] = acc.get(key, 0) + value
            if not stats.get("gp"):
                acc["gp"] = acc.get("gp", 0) + 1
    return totals


def season_window(state: Mapping[str, Any], regular_weeks: int) -> tuple[str, str, int]:
    """Current season, previous season and the last week with games to fetch."""
    season = str(state.get("league_season") or state.get("season"))
    if not season.isdigit() or len(season) != 4:
        raise ValueError(f"Unexpected season in state: {season!r}")
    prev_season = str(int(season) - 1)
    season_type = state.get("season_type")
    if season_type == "pre":
        last_week = 0
    elif season_type == "regular" and str(state.get("season")) == season:
        last_week = min(int(state.get("week") or 1), regular_weeks)
    else:
        last_week = regular_weeks
    return season, prev_season, last_week


def team_usage(entries: Iterable[Entry], usage_keys: tuple[str, ...]) -> dict[str, list[float]]:
    """
    One week's team totals of the usage stats (targets, carries, ...), summed
    over every player who played for the team that week, fantasy-relevant or not.
    Team aggregate records (TEAM_XXX) and defenses are skipped.
    """
    totals: dict[str, list[float]] = {}
    for entry in entries:
        team = entry.get("team")
        pid = str(entry.get("player_id") or "")
        if not isinstance(team, str) or not team or pid.startswith("TEAM_") or not pid.isdigit():
            continue
        stats = entry.get("stats") or {}
        row = totals.setdefault(team, [0.0] * len(usage_keys))
        for i, key in enumerate(usage_keys):
            value = stats.get(key)
            if is_number(value):
                row[i] += value
    return {team: [round(v, 2) for v in row] for team, row in sorted(totals.items())}


def build_stats(
    *,
    sport: SportConfig,
    directory: Mapping[str, Mapping[str, Any]],
    prev_totals: Mapping[str, Stats],
    weeks: Mapping[int, list[Entry]],
    season: str,
    prev_season: str,
    generated_at: str,
    projections: Mapping[str, Stats] | None = None,
    current: bool = True,
) -> dict[str, Any]:
    """
    The compact stats file.

    ``projections`` are Sleeper's preseason projections for ``season`` (stat
    totals plus ADP). ``current=False`` builds a past season for backtests: players keep only
    what is true for that season (no current team, age or injury), and the
    team shown is the last team they played for that season.
    """
    keys = KeyIndex(sport)
    players: dict[str, dict[str, Any]] = {}

    def ensure(pid: str) -> dict[str, Any]:
        if pid not in players:
            players[pid] = player_info(directory.get(pid) or {}, sport, current=current)
        return players[pid]

    if current:
        # Every fantasy-relevant player on a team, so rosters show names even
        # for players who have not played yet this season.
        for pid, meta in directory.items():
            if is_fantasy_player(meta, sport) and (meta.get("team") or meta.get("active")):
                ensure(pid)

    for pid, stats in prev_totals.items():
        games = int(stats.get("gp") or 0)
        if games == 0 or not is_fantasy_player(directory.get(pid) or {}, sport):
            continue
        ensure(pid)["prev"] = {"g": games, "s": keys.pack(stats)}

    weeks_with_games: list[int] = []
    team_weeks: dict[str, dict[str, list[float]]] = {}
    for week in sorted(weeks):
        entries = weeks[week]
        count = 0
        for entry in entries:
            pid = str(entry["player_id"])
            stats = entry.get("stats") or {}
            if not played(stats) or not is_fantasy_player(directory.get(pid) or {}, sport):
                continue
            player = ensure(pid)
            player.setdefault("w", {})[str(week)] = keys.pack(stats)
            team = entry.get("team")
            if isinstance(team, str) and team:
                player.setdefault("tw", {})[str(week)] = team
                if not current:
                    player["t"] = team
            count += 1
        if count:
            weeks_with_games.append(week)
            for team, row in team_usage(entries, sport.usage_keys).items():
                team_weeks.setdefault(team, {})[str(week)] = row

    # Preseason projections (season totals) and draft-market ADP, for players
    # already in the file or drafted in a typical league.
    for pid, stats in (projections or {}).items():
        adp = {
            short: round(float(stats[key]), 1)
            for key, short in sport.adp_keys
            if is_number(stats.get(key)) and 0 < stats[key] <= sport.adp_max
        }
        if pid not in players and not adp:
            continue
        if not is_fantasy_player(directory.get(pid) or {}, sport):
            continue
        player = ensure(pid)
        packed = keys.pack(stats)
        if packed:
            player["proj"] = packed
        if adp:
            player["adp"] = adp

    kept = {
        pid: p
        for pid, p in players.items()
        if p["fp"] and (p.get("prev") or p.get("w") or p["t"] or p.get("adp"))
    }
    return {
        "generated_at": generated_at,
        "sport": sport.id,
        "season": season,
        "prev_season": prev_season,
        "weeks": weeks_with_games,
        "keys": keys.keys,
        "usage_keys": list(sport.usage_keys),
        "season_games": sport.season_games,
        "team_weeks": dict(sorted(team_weeks.items())),
        "players": kept,
    }
