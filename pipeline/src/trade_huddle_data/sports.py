"""Everything the pipeline needs to know about a sport: one entry per sport."""

from dataclasses import dataclass


@dataclass(frozen=True)
class SportConfig:
    id: str
    #: Positions the site values (IDP is not supported yet).
    fantasy_positions: frozenset[str]
    regular_season_weeks: int
    #: Stats that never appear in scoring rules (rates, ranks, snaps, precomputed
    #: fantasy points). Dropping them keeps the file small.
    exclude_exact: frozenset[str]
    exclude_prefixes: tuple[str, ...]
    exclude_suffixes: tuple[str, ...]
    #: Per-week team totals stored for usage (opportunity share).
    usage_keys: tuple[str, ...]
    #: Games per team in the regular season (season projections are divided by it).
    season_games: int
    #: Draft-market ADP fields kept from Sleeper's projections, and their short names.
    adp_keys: tuple[tuple[str, str], ...]
    #: ADPs past this pick are noise (players nobody drafts) and are dropped.
    adp_max: float
    #: What one entry of a player's season is: a "week" (NFL, one game a week) or a
    #: game "day" (NBA, several games a week; a team plays at most once a day).
    period: str = "week"
    #: Sleeper's preseason projections are season totals (NFL) or per-game averages (NBA).
    projections_per_game: bool = False


NFL = SportConfig(
    id="nfl",
    fantasy_positions=frozenset({"QB", "RB", "WR", "TE", "K", "DEF"}),
    regular_season_weeks=18,
    exclude_exact=frozenset(
        {
            "gp",
            "gs",
            "gms_active",
            "pts_std",
            "pts_ppr",
            "pts_half_ppr",
            "pts_idp",
            "cmp_pct",
            "pass_rtg",
            "fgm_pct",
            "xp_pct",
        }
    ),
    exclude_prefixes=("pos_rank_", "rank_", "tm_", "fan_pts_allow", "idp_", "opp_", "adp_"),
    exclude_suffixes=(
        "_snp",
        "_pct",
        "_ypa",
        "_ypc",
        "_ypr",
        "_ypt",
        "_lng",
        "_rtg",
        "_air_yd",
        "_yar",
        "_yac",
        "_per_play",
    ),
    usage_keys=("rec_tgt", "rush_att", "rec_rz_tgt"),
    season_games=17,
    adp_max=240,
    adp_keys=(("adp_half_ppr", "half"), ("adp_ppr", "ppr"), ("adp_std", "std"), ("adp_2qb", "2qb")),
)

NBA = SportConfig(
    id="nba",
    fantasy_positions=frozenset({"PG", "SG", "SF", "PF", "C"}),
    regular_season_weeks=25,
    exclude_exact=frozenset(
        {
            "gp",
            "gs",
            "pts_std",
            "pts_std_dfs",
            "plus_minus",
            "pace",
            "pace_rank",
            "pts_allowed",
            "tpm_allowed",
            # Combined stats: leagues score their parts.
            "pts_reb",
            "pts_ast",
            "reb_ast",
            "pts_reb_ast",
            "blk_stl",
        }
    ),
    # Quarter, half and overtime splits, ranks and what defenses allow.
    exclude_prefixes=(
        "q1_",
        "q2_",
        "q3_",
        "q4_",
        "h1_",
        "h2_",
        "ot_",
        "pos_rank_",
        "rank_",
        "pos_def_rank_",
        "pts_std_allowed",
        "adp_",
    ),
    exclude_suffixes=("_pct",),
    usage_keys=(),
    season_games=82,
    adp_max=200,
    adp_keys=(("adp_std", "std"),),
    period="day",
    projections_per_game=True,
)

SPORTS: dict[str, SportConfig] = {NFL.id: NFL, NBA.id: NBA}
