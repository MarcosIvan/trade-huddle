"""Everything the pipeline needs to know about a sport. NBA will get its own entry."""

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
    exclude_prefixes=("pos_rank_", "rank_", "tm_", "fan_pts_allow", "idp_", "opp_"),
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
)

SPORTS: dict[str, SportConfig] = {NFL.id: NFL}
