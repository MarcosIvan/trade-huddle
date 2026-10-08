import type { ModelParams, SportConfig, StatGroup, TradeValueParams } from "./types";

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
  injuredPriorGames: 0,
  teammateReturn: 0,
  keyTeammatePpg: 10,
  nextGameBlend: {},
  matchupWeight: 0,
  matchupShrinkGames: 4,
  similarWeight: 0,
  weekProjWeight: 0,
  weekAvailability: {
    Questionable: 0.85,
    Doubtful: 0.25,
    Out: 0,
    IR: 0,
    PUP: 0,
    Sus: 0,
    NA: 0,
  },

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

const PASSING: StatGroup = {
  label: "Passing",
  columns: [
    { key: "pass_cmp", label: "Cmp", title: "Completions" },
    { key: "pass_att", label: "Att", title: "Pass attempts" },
    { key: "pass_yd", label: "Yds", title: "Passing yards" },
    { key: "pass_td", label: "TD", title: "Passing touchdowns" },
    { key: "pass_int", label: "Int", title: "Interceptions", lowerIsBetter: true },
  ],
};
const RUSHING: StatGroup = {
  label: "Rushing",
  columns: [
    { key: "rush_att", label: "Att", title: "Carries" },
    { key: "rush_yd", label: "Yds", title: "Rushing yards" },
    { key: "rush_td", label: "TD", title: "Rushing touchdowns" },
  ],
};
const RECEIVING: StatGroup = {
  label: "Receiving",
  columns: [
    { key: "rec_tgt", label: "Tgt", title: "Targets" },
    { key: "rec", label: "Rec", title: "Receptions" },
    { key: "rec_yd", label: "Yds", title: "Receiving yards" },
    { key: "rec_td", label: "TD", title: "Receiving touchdowns" },
  ],
};

/** Trade value: calibrated in ADR 0010 against real trade values, scale shape in ADR 0013. */
export const NFL_TRADE_VALUE: TradeValueParams = {
  weights: { base: 5, market: 10, expected: 30, season: 10, recent: 5, scarcity: 25, usage: 15 },
  curve: 0.8,
  leadShare: { RB: 0.55, WR: 0.2, TE: 0.14 },
  usageGames: 4,
  elite: 3,
  spread: 1.2,
  scarcityFloor: 0.5,
  scarcityPower: 0.6,
  minorPositions: ["K", "DEF"],
  minorScale: 0.3,
  // About the 4th round in 12-team leagues.
  adpHalf: 40,
  adpCurve: 2,
  reputationMaxAdp: 60,
  reputationGames: 8,
  injuryRecovery: 0.4,
  positionMarket: {},
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
  tradePositions: ["QB", "RB", "WR", "TE"],
  defaultTeams: 12,
  gameLog: {
    QB: [PASSING, RUSHING],
    RB: [RUSHING, RECEIVING],
    WR: [RECEIVING, RUSHING],
    TE: [RECEIVING, RUSHING],
  },
  model: {
    ...PROTOTYPE_MODEL,
    // Calibrated by backtest on 2024 and 2025 (docs/adr/0001-value-model-calibration.md).
    // The prior is Sleeper's preseason projection (5% above it: projections run
    // conservative), or last season when there is none (docs/adr/0003-market-prior.md).
    projWeight: 1,
    projScale: 1.05,
    // Out long term (IR, PUP...) after a full enough last season: last season is the
    // prior, since the season projection already leaves out his missed games.
    injuredPriorGames: 8,
    // The prior's weight is 8 / (8 + games): 73% after 3 games, 50% after 8.
    wPrevStart: 1,
    wPrevMin: 0,
    prevReliabilityGames: 8,
    recentShare: 0.25,
    recentAfterWindow: true,
    // 30% of each game's points come from what its targets and carries usually produce.
    usageBlend: 0.3,
    // 30% of the expected points come from Sleeper's projection for the next game,
    // when he is expected to play it (backtest: docs/adr/0011-next-game-projection.md).
    nextGameBlend: { QB: 0.3, RB: 0.3, WR: 0.3, TE: 0.3 },
    // No team: a quarter of the value (he may sign somewhere) and never started.
    noTeamMult: 0.25,
    // Weekly lineup (docs/adr/0005-weekly-lineup.md): 65% Sleeper's weekly projection,
    // 35% our value adjusted for what the opponent allows to the position. Our value
    // already holds 30% of that projection (nextGameBlend), so it weighs about 75%.
    weekProjWeight: 0.65,
    matchupWeight: 0.5,
    matchupShrinkGames: 2,
    // Bench depth per team, calibrated against draft ADP (docs/adr/0002-positional-scarcity.md).
    benchDepth: { QB: 0, RB: 1.5, WR: 1, TE: 0.25 },
  },
  tradeValue: NFL_TRADE_VALUE,
};

/** NFL with the prototype's model, for regression tests. */
export const NFL_PROTOTYPE: SportConfig = { ...NFL, model: PROTOTYPE_MODEL };
