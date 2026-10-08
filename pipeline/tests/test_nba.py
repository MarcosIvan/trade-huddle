"""The NBA: several games a week, kept by game day (fictional players and teams)."""

from typing import Any

import pytest

from trade_huddle_data.sports import NBA
from trade_huddle_data.transform import (
    build_stats,
    compact_schedule,
    day_weeks,
    game_days,
    keep_key,
    lineup_week,
)

DIRECTORY: dict[str, dict[str, Any]] = {
    "1": {
        "full_name": "Ana Guard",
        "position": "PG",
        "fantasy_positions": ["PG", "SG"],
        "team": "AAA",
    },
    "2": {"full_name": "Bo Center", "position": "C", "fantasy_positions": ["C"], "team": "BBB"},
}

# Week 1: AAA plays on days 1 and 3, BBB on days 1 and 2; one game is postponed.
SCHEDULE: list[dict[str, Any]] = [
    {
        "week": 1,
        "date": "2026-10-20",
        "home": {"team": "AAA"},
        "away": {"team": "BBB"},
        "status": "complete",
    },
    {
        "week": 1,
        "date": "2026-10-21",
        "home": {"team": "BBB"},
        "away": {"team": "CCC"},
        "status": "complete",
    },
    {
        "week": 1,
        "date": "2026-10-22",
        "home": {"team": "DDD"},
        "away": {"team": "AAA"},
        "status": "complete",
    },
    {
        "week": 1,
        "date": "2026-10-23",
        "home": {"team": "CCC"},
        "away": {"team": "DDD"},
        "status": "postponed",
    },
    {
        "week": 2,
        "date": "2026-10-27",
        "home": {"team": "AAA"},
        "away": {"team": "CCC"},
        "status": "pre_game",
    },
    {
        "week": 2,
        "date": "2026-10-29",
        "home": {"team": "BBB"},
        "away": {"team": "AAA"},
        "status": "pre_game",
    },
]


def line(pid: str, team: str, day: str, **stats: float) -> dict[str, Any]:
    return {"player_id": pid, "team": team, "date": day, "stats": stats}


WEEKS: dict[int, list[dict[str, Any]]] = {
    1: [
        line(
            "1",
            "AAA",
            "2026-10-20",
            pts=24,
            reb=5,
            ast=9,
            sp=2100,
            q1_pts=8,
            pts_reb=29,
            pts_std=40,
        ),
        line("1", "AAA", "2026-10-22", pts=31, reb=4, ast=7, tpm=5, sp=2200),
        line("2", "BBB", "2026-10-20", pts=12, reb=14, blk=3, dd=1, sp=1900),
        line("2", "BBB", "2026-10-21", pts=0, reb=0, sp=0),  # did not play
    ]
}

WEEK_PROJECTIONS: dict[int, list[dict[str, Any]]] = {
    2: [
        line("1", "AAA", "2026-10-27", pts=26.5, reb=4.8, ast=8.1),
        line("1", "AAA", "2026-10-29", pts=25.1, reb=4.5, ast=7.9),
        line("2", "BBB", "2026-10-29", pts=13.2, reb=12.4),
    ]
}


@pytest.fixture
def data() -> dict[str, Any]:
    return build_stats(
        sport=NBA,
        directory=DIRECTORY,
        prev_totals={"1": {"gp": 70, "pts": 1700, "ast": 560}},
        weeks=WEEKS,
        season="2026",
        prev_season="2025",
        generated_at="2026-10-23T10:00:00+00:00",
        schedule=SCHEDULE,
        week_projections=WEEK_PROJECTIONS,
    )


def unpack(data: dict[str, Any], packed: list[float]) -> dict[str, float]:
    return {data["keys"][int(packed[i])]: packed[i + 1] for i in range(0, len(packed), 2)}


class TestGameDays:
    def test_count_calendar_days_from_the_first_game(self) -> None:
        days = game_days(SCHEDULE)
        assert days["2026-10-20"] == 1
        assert days["2026-10-22"] == 3
        # A rest day keeps its gap.
        assert days["2026-10-27"] == 8

    def test_map_each_day_to_its_fantasy_week(self) -> None:
        assert day_weeks(SCHEDULE, game_days(SCHEDULE)) == {"1": 1, "2": 1, "3": 1, "8": 2, "10": 2}

    def test_read_team_objects_and_skip_postponed_games(self) -> None:
        assert compact_schedule(SCHEDULE, game_days(SCHEDULE)) == {
            "1": [["BBB", "AAA"]],
            "2": [["CCC", "BBB"]],
            "3": [["AAA", "DDD"]],
            "8": [["CCC", "AAA"]],
            "10": [["AAA", "BBB"]],
        }

    def test_a_postponed_game_does_not_hold_the_lineup_week(self) -> None:
        done = [g if g["week"] == 2 else {**g, "status": "complete"} for g in SCHEDULE]
        assert lineup_week(SCHEDULE) == 2
        assert lineup_week(done) == 2


class TestStatsFile:
    def test_keeps_each_game_by_day(self, data: dict[str, Any]) -> None:
        guard = data["players"]["1"]
        assert data["period"] == "day"
        assert data["weeks"] == [1, 3]
        assert sorted(guard["w"]) == ["1", "3"]
        assert guard["tw"] == {"1": "AAA", "3": "AAA"}
        assert unpack(data, guard["w"]["3"]) == {
            "ast": 7,
            "pts": 31,
            "reb": 4,
            "sp": 2200,
            "tpm": 5,
        }

    def test_drops_a_game_he_did_not_play(self, data: dict[str, Any]) -> None:
        assert sorted(data["players"]["2"]["w"]) == ["1"]

    def test_keeps_one_projection_per_game(self, data: dict[str, Any]) -> None:
        guard = data["players"]["1"]
        assert sorted(guard["wp"]) == ["10", "8"]
        assert unpack(data, guard["wp"]["8"])["pts"] == 26.5

    def test_maps_days_to_weeks_and_dates(self, data: dict[str, Any]) -> None:
        assert data["day_weeks"]["3"] == 1
        assert data["day_dates"]["8"] == "2026-10-27"
        assert data["lineup_week"] == 2

    def test_has_no_usage_totals(self, data: dict[str, Any]) -> None:
        assert data["usage_keys"] == []
        assert data["team_weeks"] == {}
        assert data["season_games"] == 82


class TestKeys:
    @pytest.mark.parametrize(
        "key", ["q1_pts", "h2_reb", "ot_ast", "pts_reb", "blk_stl", "plus_minus", "pts_std"]
    )
    def test_drops_splits_and_combined_stats(self, key: str) -> None:
        assert not keep_key(key, NBA)

    @pytest.mark.parametrize(
        "key",
        [
            "pts",
            "reb",
            "ast",
            "stl",
            "blk",
            "to",
            "tpm",
            "dd",
            "td",
            "bonus_pt_40p",
            "ff",
            "tf",
            "fgmi",
            "sp",
        ],
    )
    def test_keeps_what_leagues_score(self, key: str) -> None:
        assert keep_key(key, NBA)
