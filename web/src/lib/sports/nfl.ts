import type { SportConfig } from "./types";

export const NFL: SportConfig = {
  id: "nfl",
  positions: ["QB", "RB", "WR", "TE", "K", "DEF"],
  slotEligibility: {
    QB: ["QB"],
    RB: ["RB"],
    WR: ["WR"],
    TE: ["TE"],
    K: ["K"],
    DEF: ["DEF"],
    FLEX: ["RB", "WR", "TE"],
    WRRB_FLEX: ["WR", "RB"],
    REC_FLEX: ["WR", "TE"],
    SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  },
  slotLabels: { FLEX: "FLEX", WRRB_FLEX: "W/R", REC_FLEX: "W/T", SUPER_FLEX: "SFLEX" },
  unsupportedSlots: ["DL", "LB", "DB", "IDP_FLEX"],
  freeAgentPositions: ["QB", "RB", "WR", "TE"],
  defaultTeams: 12,
  model: {
    // Last season starts at 60% and drops 8 points per game played, down to 10%.
    wPrevStart: 0.6,
    wPrevDecay: 0.08,
    wPrevMin: 0.1,
    prevFullGames: 4,
    recentShare: 0.55,
    recentGames: 3,
    shrinkGames: 1,
    injury: {
      IR: { mult: 0.5, startable: false },
      PUP: { mult: 0.5, startable: false },
      Sus: { mult: 0.5, startable: false },
      NA: { mult: 0.5, startable: false },
      Out: { mult: 0.9, startable: true },
      Doubtful: { mult: 0.95, startable: true },
    },
    replacementPool: 3,

    minGainMe: 0.3,
    minGainThem: 0.1,
    minFairness: 0.75,
    candidates: 10,
    minCandidateVorp: 0.05,
    maxSuggestions: 3,
    partnerGainWeight: 0.6,
    extraPlayerPenalty: 0.15,

    balancedDiff: 0.1,
    slightDiff: 0.25,
  },
};
