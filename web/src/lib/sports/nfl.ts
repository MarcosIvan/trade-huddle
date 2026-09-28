import type { ModelParams, SportConfig } from "./types";

/**
 * The model exactly as the original prototype had it. Kept so tests can prove
 * the TypeScript port reproduces the prototype.
 */
export const PROTOTYPE_MODEL: ModelParams = {
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
  prevReliabilityGames: 0,
  recentAfterWindow: false,
  outlierCap: 0,
  usageBlend: 0,
  usagePositions: ["RB", "WR", "TE"],
  noTeamMult: null,
  benchDepth: {},
  projWeight: 0,
  projScale: 1,

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
};

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
    ...PROTOTYPE_MODEL,
    // Calibrated by backtest on 2024 and 2025 (docs/adr/0001-value-model-calibration.md).
    // The prior is Sleeper's preseason projection (5% above it: projections run
    // conservative), or last season when there is none (docs/adr/0003-market-prior.md).
    projWeight: 1,
    projScale: 1.05,
    // The prior's weight is 8 / (8 + games): 73% after 3 games, 50% after 8.
    wPrevStart: 1,
    wPrevMin: 0,
    prevReliabilityGames: 8,
    recentShare: 0.25,
    recentAfterWindow: true,
    // 30% of each game's points come from what its targets and carries usually produce.
    usageBlend: 0.3,
    // No team: a quarter of the value (he may sign somewhere) and never started.
    noTeamMult: 0.25,
    // Bench depth per team, calibrated against draft ADP (docs/adr/0002-positional-scarcity.md).
    benchDepth: { QB: 0, RB: 1.5, WR: 1, TE: 0.25 },
  },
};

/** NFL with the prototype's model, for regression tests. */
export const NFL_PROTOTYPE: SportConfig = { ...NFL, model: PROTOTYPE_MODEL };
