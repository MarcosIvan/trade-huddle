"""Sleeper's public, read-only API. No keys or authentication."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

from .sports import SportConfig
from .transform import Entry, sum_weeks, to_entries

API = "https://api.sleeper.app/v1"
STATS_API = "https://api.sleeper.com/stats"
PROJECTIONS_API = "https://api.sleeper.com/projections"
SCHEDULE_API = "https://api.sleeper.com/schedule"
USER_AGENT = "trade-huddle-data-builder"
#: Sleeper asks for the player directory to be downloaded at most once a day.
DIRECTORY_MAX_AGE_SECONDS = 24 * 3600


class SleeperClient:
    def __init__(
        self,
        session: requests.Session | None = None,
        *,
        retries: int = 3,
        sleep: Callable[[float], None] = time.sleep,
        cache_dir: Path | None = None,
    ) -> None:
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.retries = retries
        self.sleep = sleep
        self.cache_dir = cache_dir

    def get(self, url: str, params: dict[str, str] | list[tuple[str, str]] | None = None) -> Any:
        for attempt in range(self.retries):
            try:
                response = self.session.get(url, params=params, timeout=90)
                response.raise_for_status()
                return response.json()
            except requests.RequestException:
                if attempt == self.retries - 1:
                    raise
                self.sleep(3 * (attempt + 1))
        raise AssertionError("unreachable")

    def state(self, sport: SportConfig) -> dict[str, Any]:
        data = self.get(f"{API}/state/{sport.id}")
        if not isinstance(data, dict):
            raise ValueError("Unexpected state response")
        return data

    def directory(self, sport: SportConfig) -> dict[str, dict[str, Any]]:
        """The player directory, cached on disk for a day when a cache directory is set."""
        cache = self.cache_dir / f"players_{sport.id}.json" if self.cache_dir else None
        if cache and cache.is_file():
            age = datetime.now(UTC).timestamp() - cache.stat().st_mtime
            if age < DIRECTORY_MAX_AGE_SECONDS:
                cached: dict[str, dict[str, Any]] = json.loads(cache.read_text("utf-8"))
                return cached
        data = self.get(f"{API}/players/{sport.id}")
        if not isinstance(data, dict):
            raise ValueError("Unexpected player directory response")
        if cache:
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(data), "utf-8")
        return data

    def week(self, sport: SportConfig, season: str, week: int) -> list[Entry]:
        return to_entries(
            self.get(f"{STATS_API}/{sport.id}/{season}/{week}", {"season_type": "regular"})
        )

    def projections(self, sport: SportConfig, season: str) -> dict[str, dict[str, Any]]:
        """Sleeper's preseason projections for the season, with draft-market ADP."""
        params = [("season_type", "regular")] + [
            ("position[]", pos) for pos in sorted(sport.fantasy_positions)
        ]
        entries = to_entries(self.get(f"{PROJECTIONS_API}/{sport.id}/{season}", params))
        return {str(e["player_id"]): e.get("stats") or {} for e in entries}

    def schedule(self, sport: SportConfig, season: str) -> list[dict[str, Any]]:
        """Every regular-season game: week, home, away and status."""
        data = self.get(f"{SCHEDULE_API}/{sport.id}/regular/{season}")
        return [g for g in (data or []) if isinstance(g, dict)]

    def week_projections(
        self, sport: SportConfig, season: str, week: int
    ) -> dict[str, dict[str, Any]]:
        """Sleeper's projection for one week (it already accounts for the opponent)."""
        params = [("season_type", "regular")] + [
            ("position[]", pos) for pos in sorted(sport.fantasy_positions)
        ]
        entries = to_entries(self.get(f"{PROJECTIONS_API}/{sport.id}/{season}/{week}", params))
        return {str(e["player_id"]): e.get("stats") or {} for e in entries}

    def season_totals(self, sport: SportConfig, season: str) -> dict[str, dict[str, Any]]:
        """Full-season totals: the season endpoint, or the sum of every week as a fallback."""
        try:
            entries = to_entries(
                self.get(f"{STATS_API}/{sport.id}/{season}", {"season_type": "regular"})
            )
            if any((e.get("stats") or {}).get("gp") for e in entries):
                return {str(e["player_id"]): e.get("stats") or {} for e in entries}
        except requests.RequestException:
            pass
        print(f"  Summing {season} week by week...")
        weeks = (self.week(sport, season, w) for w in range(1, sport.regular_season_weeks + 1))
        return sum_weeks(weeks)
