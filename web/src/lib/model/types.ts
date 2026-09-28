/** Shapes shared by the model. The model is plain TypeScript: no React, no DOM. */

/** Stats packed as [keyIndex, value, keyIndex, value, ...] against StatsFile.keys. */
export type PackedStats = readonly number[];

export interface StatsPlayer {
  /** Name. */
  n?: string;
  /** Position. */
  p?: string;
  /** Fantasy positions. */
  fp?: readonly string[];
  /** NFL team. */
  t?: string;
  /** Age. */
  a?: number;
  /** Injury status. */
  i?: string;
  /** Roster status when not "Active". */
  s?: string;
  /** Last season: games played and total stats. */
  prev?: { g: number; s: PackedStats };
  /** This season, by week number. */
  w?: Readonly<Record<string, PackedStats>>;
  /** The team the player played for, by week number. */
  tw?: Readonly<Record<string, string>>;
  /** Sleeper's preseason projection: season totals. */
  proj?: PackedStats;
  /** Average draft position in Sleeper drafts, by format (half, ppr, std, 2qb). */
  adp?: Readonly<Record<string, number>>;
}

/** The league-independent stats file built by the data pipeline. */
export interface StatsFile {
  generated_at: string;
  season: string;
  prev_season: string;
  weeks: readonly number[];
  keys: readonly string[];
  players: Readonly<Record<string, StatsPlayer>>;
  /** Stats summed per team and week in team_weeks (targets, carries, ...). */
  usage_keys?: readonly string[];
  /** Games in a season, for turning projected totals into points per game. */
  season_games?: number;
  /** Team totals of usage_keys, by team and week number. */
  team_weeks?: Readonly<Record<string, Readonly<Record<string, readonly number[]>>>>;
  demo?: boolean;
}

/** The parts of a Sleeper league the model reads. */
export interface LeagueSettings {
  roster_positions?: readonly string[];
  scoring_settings?: Readonly<Record<string, number>>;
  total_rosters?: number;
  settings?: { num_teams?: number };
}

export interface ValueWeights {
  prev: number;
  season: number;
  recent: number;
  repl: number;
}

/** What lineups and trades need from any player, real or a placeholder free agent. */
export interface Valued {
  id: string;
  name: string;
  pos: string;
  elig: readonly string[];
  value: number;
  vorp: number;
  startable: boolean;
}

export interface WeekPoints {
  week: number;
  /** Null when the player did not play that week. */
  pts: number | null;
}

export interface Player extends Valued {
  team: string;
  /** No NFL team right now (released, retired or unsigned). */
  noTeam: boolean;
  age: number | undefined;
  inj: string | null;
  status: string | null;
  weekly: WeekPoints[];
  /** Games played this season. */
  g: number;
  seasonAvg: number | null;
  lastAvg: number | null;
  /** Games played last season. */
  prevG: number;
  prevPpg: number | null;
  injMult: number;
  weights: ValueWeights;
}

export interface FreeAgent extends Valued {
  freeAgent: true;
}

export type ReplacementLevels = Readonly<Record<string, number>>;

export interface Model {
  players: Readonly<Record<string, Player>>;
  repl: ReplacementLevels;
  /** The league's lineup slots the model can fill, in league order. */
  slots: readonly string[];
  teams: number;
}
