import type { LeagueSettings } from "../../src/lib/model";

/** Sleeper's default lineup: 12 teams, 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX, K, DEF. */
const ROSTER = [
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "TE",
  "FLEX",
  "K",
  "DEF",
  "BN",
  "BN",
  "BN",
  "BN",
  "BN",
];

/** Sleeper's default scoring (half PPR). */
const HALF_PPR: Record<string, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 0.5,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  st_td: 6,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50p: 5,
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
  sack: 1,
  int: 2,
  fum_rec: 2,
  def_td: 6,
  safe: 2,
  blk_kick: 2,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4,
};

export const BENCHMARK_LEAGUES: Record<string, LeagueSettings> = {
  "half-PPR": { roster_positions: ROSTER, scoring_settings: HALF_PPR, total_rosters: 12 },
  PPR: { roster_positions: ROSTER, scoring_settings: { ...HALF_PPR, rec: 1 }, total_rosters: 12 },
};
