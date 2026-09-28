from typing import Any

import pytest

from trade_huddle_data.sports import NFL
from trade_huddle_data.transform import (
    KeyIndex,
    build_stats,
    keep_key,
    played,
    player_info,
    season_window,
    sum_weeks,
    team_usage,
    to_entries,
)


def unpack(data: dict[str, Any], packed: list[float]) -> dict[str, float]:
    return {data["keys"][int(packed[i])]: packed[i + 1] for i in range(0, len(packed), 2)}


def build(
    directory: Any,
    prev_totals: Any,
    weeks: Any,
    *,
    current: bool = True,
    projections: Any = None,
) -> dict[str, Any]:
    return build_stats(
        projections=projections,
        sport=NFL,
        directory=directory,
        prev_totals=prev_totals,
        weeks=weeks,
        season="2026",
        prev_season="2025",
        generated_at="2026-09-29T10:00:00+00:00",
        current=current,
    )


class TestHelpers:
    def test_to_entries_accepts_list_and_dict(self) -> None:
        assert to_entries([{"player_id": "1"}, {"x": 1}, "junk", None]) == [{"player_id": "1"}]
        assert to_entries({"7": {"gp": 1}}) == [{"player_id": "7", "stats": {"gp": 1}}]
        assert to_entries(None) == []

    def test_played(self) -> None:
        assert played({"gp": 1})
        assert played({"pts_ppr": 3.2})
        assert not played({"rec_tgt": 0})

    @pytest.mark.parametrize(
        "key",
        [
            "gp",
            "pts_ppr",
            "pos_rank_ppr",
            "rank_ppr",
            "off_snp",
            "rec_ypr",
            "tm_off_snp",
            "idp_tkl",
        ],
    )
    def test_drops_keys_never_used_in_scoring(self, key: str) -> None:
        assert not keep_key(key, NFL)

    @pytest.mark.parametrize(
        "key",
        ["rec", "rec_yd", "rec_tgt", "rec_rz_tgt", "bonus_rec_te", "pts_allow_14_20", "fgm_50p"],
    )
    def test_keeps_scoring_and_usage_keys(self, key: str) -> None:
        assert keep_key(key, NFL)

    def test_key_index_packs_nonzero_numbers(self) -> None:
        index = KeyIndex(NFL)
        assert index.pack({"rec": 5, "rec_yd": 70.456, "gp": 1, "zero": 0, "flag": True}) == [
            0,
            5,
            1,
            70.46,
        ]
        assert index.pack({"rec_yd": 10}) == [1, 10]
        assert index.keys == ["rec", "rec_yd"]

    def test_player_info_only_describes_today_for_the_current_season(self, directory: Any) -> None:
        now = player_info(directory["100"], NFL, current=True)
        assert now == {
            "n": "Alpha Receiver",
            "p": "WR",
            "fp": ["WR"],
            "t": "AAA",
            "a": 27,
            "i": "Questionable",
        }
        past = player_info(directory["100"], NFL, current=False)
        assert past == {"n": "Alpha Receiver", "p": "WR", "fp": ["WR"], "t": ""}
        assert player_info(directory["200"], NFL, current=True)["n"] == "Beta Back"

    def test_sum_weeks_adds_games_and_counts_missing_gp(self) -> None:
        totals = sum_weeks(
            [
                [{"player_id": "1", "stats": {"gp": 1, "rec": 3}}],
                [
                    {"player_id": "1", "stats": {"pts_ppr": 5, "rec": 2}},
                    {"player_id": "2", "stats": {}},
                ],
            ]
        )
        assert totals == {"1": {"gp": 2, "rec": 5, "pts_ppr": 5}}


class TestSeasonWindow:
    def test_regular_season_uses_the_current_week(self) -> None:
        state = {"season": "2026", "league_season": "2026", "season_type": "regular", "week": 3}
        assert season_window(state, 18) == ("2026", "2025", 3)

    def test_preseason_has_no_weeks(self) -> None:
        assert season_window({"season": "2026", "season_type": "pre", "week": 0}, 18) == (
            "2026",
            "2025",
            0,
        )

    def test_postseason_uses_every_week(self) -> None:
        assert season_window({"season": "2025", "season_type": "post", "week": 20}, 18)[2] == 18

    def test_rejects_a_strange_season(self) -> None:
        with pytest.raises(ValueError):
            season_window({"season": "../x"}, 18)


class TestTeamUsage:
    def test_sums_every_player_of_the_team_but_skips_aggregates(self, weeks: Any) -> None:
        usage = team_usage(weeks[1], NFL.usage_keys)
        # AAA targets: 8 + 3 + 1 (lineman) + 0 (did not play); TEAM_AAA and the defense are skipped.
        assert usage["AAA"] == [12, 0, 0]
        assert usage["BBB"] == [2, 15, 0]


class TestBuildStats:
    def test_players_keep_last_season_and_each_week(
        self, directory: Any, prev_totals: Any, weeks: Any
    ) -> None:
        data = build(directory, prev_totals, weeks)
        alpha = data["players"]["100"]
        assert alpha["prev"]["g"] == 16
        assert unpack(data, alpha["prev"]["s"]) == {"rec": 80, "rec_yd": 1000}
        assert unpack(data, alpha["w"]["1"]) == {"rec": 5, "rec_yd": 70, "rec_tgt": 8}
        assert unpack(data, alpha["w"]["2"]) == {
            "rec": 7,
            "rec_yd": 110,
            "rec_tgt": 10,
            "rec_rz_tgt": 2,
        }
        assert data["weeks"] == [1, 2]

    def test_records_the_team_of_each_week(
        self, directory: Any, prev_totals: Any, weeks: Any
    ) -> None:
        data = build(directory, prev_totals, weeks)
        assert data["players"]["300"]["tw"] == {"1": "AAA", "2": "BBB"}
        assert data["team_weeks"]["AAA"]["2"] == [10, 0, 2]
        assert data["team_weeks"]["BBB"]["2"] == [5, 18, 0]
        assert data["usage_keys"] == ["rec_tgt", "rush_att", "rec_rz_tgt"]

    def test_keeps_defenses_and_drops_non_fantasy_players(
        self, directory: Any, prev_totals: Any, weeks: Any
    ) -> None:
        players = build(directory, prev_totals, weeks)["players"]
        assert "AAA" in players
        assert "400" not in players
        assert "999" not in players

    def test_keeps_players_without_a_team(
        self, directory: Any, prev_totals: Any, weeks: Any
    ) -> None:
        veteran = build(directory, prev_totals, weeks)["players"]["500"]
        assert veteran["t"] == ""
        assert veteran["prev"]["g"] == 12
        assert veteran["s"] == "Inactive"

    def test_past_season_uses_the_team_played_for(
        self, directory: Any, prev_totals: Any, weeks: Any
    ) -> None:
        players = build(directory, prev_totals, weeks, current=False)["players"]
        assert players["300"]["t"] == "BBB"
        assert "i" not in players["100"] and "a" not in players["100"]
        # Without games that season and no current-team listing, only history remains.
        assert players["500"]["t"] == ""

    def test_output_is_deterministic(self, directory: Any, prev_totals: Any, weeks: Any) -> None:
        assert build(directory, prev_totals, weeks) == build(directory, prev_totals, weeks)


class TestProjections:
    def test_keeps_projected_totals_and_valid_adp(
        self, directory: Any, prev_totals: Any, weeks: Any, projections: Any
    ) -> None:
        data = build(directory, prev_totals, weeks, projections=projections)
        alpha = data["players"]["100"]
        assert unpack(data, alpha["proj"]) == {"rec": 90, "rec_yd": 1100}
        assert alpha["adp"] == {"half": 12.4, "ppr": 10.1}  # 450 and 999: nobody drafts him there
        assert data["season_games"] == 17

    def test_adds_drafted_players_only(
        self, directory: Any, prev_totals: Any, weeks: Any, projections: Any
    ) -> None:
        players = build(directory, prev_totals, weeks, projections=projections)["players"]
        assert players["600"]["adp"] == {"half": 140.0}
        assert "700" not in players
        assert "400" not in players
