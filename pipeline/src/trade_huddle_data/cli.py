"""
Command line entry point.

    python -m trade_huddle_data build                # this season -> web/public/data/nfl/stats.json
    python -m trade_huddle_data build --season 2025  # a whole past season, for backtests
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import requests

from .sleeper import SleeperClient
from .sports import SPORTS, SportConfig
from .transform import build_stats, season_window


def build_current(client: SleeperClient, sport: SportConfig, now: datetime) -> dict[str, Any]:
    season, prev_season, last_week = season_window(client.state(sport), sport.regular_season_weeks)
    print(f"Season {season}, weeks 1-{last_week}")
    print("Player directory...")
    directory = client.directory(sport)
    print(f"Last season ({prev_season})...")
    prev_totals = client.season_totals(sport, prev_season)
    print(f"Projections ({season})...")
    projections = client.projections(sport, season)
    weeks = {}
    for week in range(1, last_week + 1):
        print(f"Week {week}...")
        weeks[week] = client.week(sport, season, week)
    return build_stats(
        sport=sport,
        directory=directory,
        prev_totals=prev_totals,
        weeks=weeks,
        season=season,
        prev_season=prev_season,
        generated_at=now.isoformat(timespec="seconds"),
        projections=projections,
    )


def build_past(
    client: SleeperClient, sport: SportConfig, season: str, now: datetime
) -> dict[str, Any]:
    """Every regular-season week of a past season, with the season before as history."""
    prev_season = str(int(season) - 1)
    print(f"Past season {season} (history: {prev_season})")
    directory = client.directory(sport)
    prev_totals = client.season_totals(sport, prev_season)
    projections = client.projections(sport, season)
    weeks = {}
    for week in range(1, sport.regular_season_weeks + 1):
        print(f"Week {week}...")
        weeks[week] = client.week(sport, season, week)
    return build_stats(
        sport=sport,
        directory=directory,
        prev_totals=prev_totals,
        weeks=weeks,
        season=season,
        prev_season=prev_season,
        generated_at=now.isoformat(timespec="seconds"),
        projections=projections,
        current=False,
    )


def write_json(data: dict[str, Any], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), "utf-8")
    size_mb = out.stat().st_size / 1_000_000
    print(
        f"Done: {len(data['players'])} players, weeks {data['weeks']}, "
        f"{len(data['keys'])} stat keys, {size_mb:.2f} MB -> {out}"
    )


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="trade_huddle_data", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build", help="build a stats file")
    build.add_argument("--sport", choices=sorted(SPORTS), default="nfl")
    build.add_argument("--season", help="a past season (YYYY) to build in full, for backtests")
    build.add_argument("--out", type=Path, help="output file")
    build.add_argument(
        "--cache-dir", type=Path, default=Path(".cache"), help="player directory cache"
    )
    args = parser.parse_args(argv)
    if args.season is not None and not (args.season.isdigit() and len(args.season) == 4):
        parser.error("--season must be a four-digit year")
    return args


def main(argv: list[str] | None = None, client: SleeperClient | None = None) -> int:
    args = parse_args(argv)
    sport = SPORTS[args.sport]
    client = client or SleeperClient(cache_dir=args.cache_dir)
    now = datetime.now(UTC)
    try:
        if args.season:
            data = build_past(client, sport, args.season, now)
            out = args.out or Path(".cache") / "seasons" / f"{sport.id}-{args.season}.json"
        else:
            data = build_current(client, sport, now)
            out = args.out or Path("web") / "public" / "data" / sport.id / "stats.json"
    except requests.RequestException as error:
        print(f"Could not reach Sleeper: {error}", file=sys.stderr)
        return 1
    write_json(data, out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
