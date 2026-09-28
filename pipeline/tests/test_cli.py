import json
from pathlib import Path
from typing import Any

import pytest
import requests

from trade_huddle_data.cli import main
from trade_huddle_data.sleeper import SleeperClient

from .conftest import DIRECTORY, PREV_TOTALS, WEEKS


class FakeSession(requests.Session):
    """Answers Sleeper URLs from the fixtures; no network."""

    def __init__(self, *, season_endpoint_works: bool = True) -> None:
        super().__init__()
        self.season_endpoint_works = season_endpoint_works
        self.urls: list[str] = []

    def get(self, url: str | bytes, params: Any = None, **kwargs: Any) -> requests.Response:
        url = str(url)
        self.urls.append(url)
        if url.endswith("/state/nfl"):
            body: Any = {
                "season": "2026",
                "league_season": "2026",
                "season_type": "regular",
                "week": 2,
            }
        elif url.endswith("/players/nfl"):
            body = DIRECTORY
        elif url.endswith("/stats/nfl/2025"):
            if not self.season_endpoint_works:
                return response(500, {})
            body = [{"player_id": pid, "stats": s} for pid, s in PREV_TOTALS.items()]
        elif "/stats/nfl/2026/" in url:
            body = WEEKS.get(int(url.rsplit("/", 1)[1]), [])
        elif "/stats/nfl/2025/" in url:
            week = int(url.rsplit("/", 1)[1])
            body = [{"player_id": "100", "stats": {"gp": 1, "rec": 5}}] if week <= 2 else []
        else:
            return response(404, None)
        return response(200, body)


def response(status: int, body: Any) -> requests.Response:
    r = requests.Response()
    r.status_code = status
    r._content = json.dumps(body).encode()
    r.url = "https://example.invalid"
    return r


def run(tmp_path: Path, session: FakeSession, *args: str) -> dict[str, Any]:
    out = tmp_path / "stats.json"
    client = SleeperClient(session, sleep=lambda _: None, cache_dir=tmp_path / "cache")
    assert main(["build", "--out", str(out), *args], client=client) == 0
    data: dict[str, Any] = json.loads(out.read_text("utf-8"))
    return data


def test_builds_the_current_season(tmp_path: Path) -> None:
    data = run(tmp_path, FakeSession())
    assert data["season"] == "2026"
    assert data["weeks"] == [1, 2]
    assert data["players"]["100"]["prev"]["g"] == 16


def test_falls_back_to_summing_weeks(tmp_path: Path) -> None:
    data = run(tmp_path, FakeSession(season_endpoint_works=False))
    assert data["players"]["100"]["prev"]["g"] == 2


def test_caches_the_player_directory_for_a_day(tmp_path: Path) -> None:
    first, second = FakeSession(), FakeSession()
    run(tmp_path, first)
    run(tmp_path, second)
    assert any(u.endswith("/players/nfl") for u in first.urls)
    assert not any(u.endswith("/players/nfl") for u in second.urls)


def test_builds_a_past_season_in_full(tmp_path: Path) -> None:
    session = FakeSession()
    session_urls = session.urls
    data = run(tmp_path, session, "--season", "2026")
    assert sum("/stats/nfl/2026/" in u for u in session_urls) == 18
    assert data["players"]["300"]["t"] == "BBB"


def test_rejects_a_bad_season(tmp_path: Path) -> None:
    with pytest.raises(SystemExit):
        main(["build", "--season", "20x6", "--out", str(tmp_path / "x.json")])


def test_reports_network_errors(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    class Down(FakeSession):
        def get(self, url: str | bytes, params: Any = None, **kwargs: Any) -> requests.Response:
            raise requests.ConnectionError("offline")

    client = SleeperClient(Down(), sleep=lambda _: None, cache_dir=tmp_path)
    assert main(["build", "--out", str(tmp_path / "x.json")], client=client) == 1
    assert "Could not reach Sleeper" in capsys.readouterr().err
