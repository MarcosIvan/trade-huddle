export { buildModel, modelSlots, rosterPlayers } from "./build";
export { bestLineup, type Lineup } from "./lineup";
export { replacementLevels } from "./replacement";
export { playerScores, SCORE_WEIGHTS, type PlayerScore } from "./score";
export { average, makeScorer } from "./scoring";
export {
  evaluateTrade,
  fairnessLevel,
  isTrueMatch,
  MATCH,
  type FairnessLevel,
  freeAgent,
  freeAgentPool,
  type FreeAgentPool,
  suggestTrades,
  type TeamRoster,
  type TradeIdea,
  type TradeResult,
} from "./trades";
export type * from "./types";
export { estimate, type Estimate } from "./value";
export { verdict, type Verdict } from "./verdict";
export { weeklyOutlook, type WeeklyOutlook } from "./weekly";
