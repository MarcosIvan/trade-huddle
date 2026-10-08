import { NFL } from "./nfl";
import type { SportConfig, StatGroup, TradeValueParams } from "./types";

/**
 * The NBA: points leagues, several games a week. Each entry of a player's season
 * is one game (the stats file keeps them by game day, ADR 0019), so every
 * "games" parameter below counts NBA games: an 82-game season against the
 * NFL's 17, about 4.8 NBA games for each NFL one.
 */

const BOX_SCORE: StatGroup = {
  label: "Box score",
  columns: [
    { key: "pts", label: "Pts", title: "Points" },
    { key: "reb", label: "Reb", title: "Rebounds" },
    { key: "ast", label: "Ast", title: "Assists" },
    { key: "stl", label: "Stl", title: "Steals" },
    { key: "blk", label: "Blk", title: "Blocks" },
    { key: "tpm", label: "3PM", title: "Three-pointers made" },
    { key: "to", label: "TO", title: "Turnovers", lowerIsBetter: true },
  ],
};

const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;

/**
 * Trade value: the NFL's recipe without the usage measure (no targets or
 * carries in basketball), its weight moved to expected points and scarcity.
 * No reputation lift: before a game is played it lifts every early pick to
 * the value of his draft rank, and the draft market already counts. Scarcity
 * follows each position's edge over a free agent linearly. Centers get a
 * market discount (`positionMarket`).
 */
export const NBA_TRADE_VALUE: TradeValueParams = {
  ...NFL.tradeValue,
  weights: { base: 5, market: 10, expected: 40, season: 10, recent: 5, scarcity: 30, usage: 0 },
  leadShare: {},
  minorPositions: [],
  scarcityPower: 1,
  reputationMaxAdp: 0,
  // The draft market's measure is one half at pick 30 (the 3rd round in 12-team leagues).
  adpHalf: 30,
  // Trade markets price centers below what points leagues score for them (rebounds and
  // blocks): up to 35% off, fading for centers the draft market already rates highly.
  positionMarket: { C: 0.35 },
};

export const NBA: SportConfig = {
  id: "nba",
  positions: POSITIONS,
  slotEligibility: {
    PG: ["PG"],
    SG: ["SG"],
    SF: ["SF"],
    PF: ["PF"],
    C: ["C"],
    G: ["PG", "SG"],
    F: ["SF", "PF"],
    UTIL: [...POSITIONS],
  },
  slotLabels: { G: "G", F: "F", UTIL: "UTIL" },
  unsupportedSlots: [],
  freeAgentPositions: POSITIONS,
  tradePositions: POSITIONS,
  defaultTeams: 12,
  multiGameWeeks: true,
  gameLog: Object.fromEntries(POSITIONS.map((pos) => [pos, [BOX_SCORE]])),
  model: {
    ...NFL.model,
    // Recent form: the last 12 games, about the NFL's last 3 in share of the season
    // (15% against 18%) and in time (three and a half weeks).
    recentGames: 12,
    // The prior's weight is k / (k + games): 38 games, the NFL's 8 in share of the season.
    prevReliabilityGames: 38,
    shrinkGames: 5,
    injuredPriorGames: 30,
    // Usage (targets and carries) and the teammate rule are football measures.
    usageBlend: 0,
    usagePositions: [],
    nextGameBlend: {},
    keyTeammatePpg: 25,
    injury: {
      IR: { mult: 0.5, startable: false },
      Sus: { mult: 0.5, startable: false },
      NA: { mult: 0.5, startable: false },
      Out: { mult: 0.9, startable: true },
    },
    weekAvailability: { GTD: 0.6, DTD: 0.75, Questionable: 0.6, Out: 0, IR: 0, Sus: 0, NA: 0 },
    // A defense's factor mixes in this many games of an average defense.
    matchupShrinkGames: 8,
    benchDepth: {},
  },
  tradeValue: NBA_TRADE_VALUE,
};
