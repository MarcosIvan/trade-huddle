"""Small hand-built responses in Sleeper's real format (fictional players)."""

from typing import Any

import pytest

DIRECTORY: dict[str, dict[str, Any]] = {
    "100": {
        "full_name": "Alpha Receiver",
        "position": "WR",
        "fantasy_positions": ["WR"],
        "team": "AAA",
        "age": 27,
        "injury_status": "Questionable",
        "status": "Active",
    },
    "200": {
        "first_name": "Beta",
        "last_name": "Back",
        "position": "RB",
        "fantasy_positions": ["RB"],
        "team": "BBB",
        "status": "Active",
    },
    # Traded from AAA to BBB in week 2.
    "300": {
        "full_name": "Gamma Mover",
        "position": "TE",
        "fantasy_positions": ["TE"],
        "team": "BBB",
    },
    # Not fantasy-relevant, but his targets count toward his team's total.
    "400": {
        "full_name": "Delta Lineman",
        "position": "OL",
        "fantasy_positions": ["OL"],
        "team": "AAA",
    },
    # Retired: no team, but played last season.
    "500": {
        "full_name": "Epsilon Veteran",
        "position": "WR",
        "fantasy_positions": ["WR"],
        "status": "Inactive",
    },
    "AAA": {"position": "DEF", "fantasy_positions": ["DEF"], "team": "AAA", "last_name": "Defense"},
}


def entry(pid: str, team: str, **stats: float) -> dict[str, Any]:
    return {"player_id": pid, "team": team, "stats": {"gp": 1, **stats}}


WEEKS: dict[int, list[dict[str, Any]]] = {
    1: [
        entry("100", "AAA", rec=5, rec_yd=70, rec_tgt=8, pos_rank_ppr=3, off_snp=60, rank_ppr=20),
        entry("300", "AAA", rec=2, rec_yd=20, rec_tgt=3),
        entry("400", "AAA", rec_tgt=1),
        entry("200", "BBB", rush_att=15, rush_yd=60, rec_tgt=2),
        {"player_id": "TEAM_AAA", "team": "AAA", "stats": {"rec_tgt": 12}},
        entry("AAA", "AAA", sack=3, pts_allow_14_20=1),
        # Did not play: no gp, no points.
        {"player_id": "999", "team": "AAA", "stats": {"rec_tgt": 0}},
    ],
    2: [
        entry("100", "AAA", rec=7, rec_yd=110, rec_tgt=10, rec_rz_tgt=2),
        entry("300", "BBB", rec=4, rec_yd=40, rec_tgt=5),
        entry("200", "BBB", rush_att=18, rush_yd=90),
    ],
}

PREV_TOTALS: dict[str, dict[str, Any]] = {
    "100": {"gp": 16, "rec": 80, "rec_yd": 1000, "pts_ppr": 200},
    "500": {"gp": 12, "rec": 50, "rec_yd": 600},
    "400": {"gp": 17, "rec": 1},
}


@pytest.fixture
def directory() -> dict[str, dict[str, Any]]:
    return DIRECTORY


@pytest.fixture
def weeks() -> dict[int, list[dict[str, Any]]]:
    return WEEKS


@pytest.fixture
def prev_totals() -> dict[str, dict[str, Any]]:
    return PREV_TOTALS
