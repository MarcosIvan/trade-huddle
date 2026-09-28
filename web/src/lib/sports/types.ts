/** Everything the model needs to know about a sport. One file per sport (nfl.ts, later nba.ts). */

export interface InjuryRule {
  /** Multiplier applied to the player's value. */
  mult: number;
  /** Whether the player can be put in a starting slot. */
  startable: boolean;
}

export interface ModelParams {
  /** Weight of last season with no games played this season. */
  wPrevStart: number;
  /** Weight of last season lost per game played this season. */
  wPrevDecay: number;
  /** Floor for last season's weight. */
  wPrevMin: number;
  /** Last season only gets full weight with at least this many games. */
  prevFullGames: number;
  /** Share of the current-season weight given to the most recent games. */
  recentShare: number;
  /** How many recent games make up "current form". */
  recentGames: number;
  /** Players without a track record are pulled toward replacement level, worth this many games. */
  shrinkGames: number;
  /** Injury statuses that change a player's value or availability. */
  injury: Readonly<Record<string, InjuryRule>>;
  /** Replacement level is the average of this many best players left after filling every lineup. */
  replacementPool: number;
  /**
   * How last season's weight fades. 0: linearly (wPrevStart − wPrevDecay × games).
   * k > 0: by reliability, k / (k + games), so a few games move it less.
   */
  prevReliabilityGames: number;
  /** Count the recent-games average only once more games than the window have been played. */
  recentAfterWindow: boolean;
  /** A single game counts at most this multiple of the player's usual output (0 = no cap). */
  outlierCap: number;
  /** Share of each game's points replaced by the points its targets and carries usually produce. */
  usageBlend: number;
  /** Positions whose expected points can be estimated from targets and carries. */
  usagePositions: readonly string[];
  /** Value multiplier for players without a team (they cannot be started); null turns the rule off. */
  noTeamMult: number | null;
  /**
   * Extra players per team, by position, that leagues keep on the bench beyond
   * the starters (for byes and injuries). They are taken out of the pool before
   * replacement level is measured, so deep positions such as RB get scarcer.
   */
  benchDepth: Readonly<Record<string, number>>;
  /**
   * Weight of Sleeper's preseason projection in the prior (the rest is last
   * season). The projection carries what the market knows: age, role changes,
   * rookies. 0 ignores projections.
   */
  projWeight: number;
  /** Projections run conservative; they are multiplied by this before use. */
  projScale: number;
  /**
   * Chance that an absent key teammate plays the rest of the season (0 turns
   * the teammate adjustment off). Longer absences (IR, PUP) get 60% of it.
   */
  teammateReturn: number;
  /** A teammate counts as key when his prior is at least this many points per game. */
  keyTeammatePpg: number;

  /** Weekly lineup: exponent on the opponent's points-allowed factor (0 ignores matchups). */
  matchupWeight: number;
  /** Weekly lineup: games of "average defense" mixed into each defense's factor. */
  matchupShrinkGames: number;
  /** Weekly lineup: exponent on the player's results against similar defenses. */
  similarWeight: number;
  /** Weekly lineup: weight of Sleeper's weekly projection in the final number. */
  weekProjWeight: number;
  /** Weekly lineup: chance of playing this week, by injury status (missing means 1). */
  weekAvailability: Readonly<Record<string, number>>;

  /** Your starters must gain at least this many points per game. */
  minGainMe: number;
  /** The partner's starters must gain at least this many points per game. */
  minGainThem: number;
  /** Smaller side's value / larger side's value. */
  minFairness: number;
  /** Players per roster considered in the trade search. */
  candidates: number;
  /** Players at or below this value over replacement are never offered or requested. */
  minCandidateVorp: number;
  /** How many trade ideas to show. */
  maxSuggestions: number;
  /** Weight of the partner's gain in a trade idea's score. */
  partnerGainWeight: number;
  /** Score penalty per player beyond a 1-for-1 deal. */
  extraPlayerPenalty: number;

  /** Value difference (share of the larger side) still called "Balanced". */
  balancedDiff: number;
  /** Value difference (share of the larger side) still called "Slightly favors". */
  slightDiff: number;
}

export interface SportConfig {
  id: string;
  /** Positions the model values. */
  positions: readonly string[];
  /** Which positions can fill each lineup slot. Slots not listed here are ignored. */
  slotEligibility: Readonly<Record<string, readonly string[]>>;
  /** Short labels for flex slots. */
  slotLabels: Readonly<Record<string, string>>;
  /** League slots the site recognizes but cannot value yet (shown as a notice). */
  unsupportedSlots: readonly string[];
  /** Positions a team may sign from free agency to fill an open roster spot in a trade. */
  freeAgentPositions: readonly string[];
  /** Number of teams assumed when a league does not say. */
  defaultTeams: number;
  model: ModelParams;
}
