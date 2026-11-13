/**
 * Everything that comes from Sleeper or from the URL is untrusted. These
 * helpers check inputs before they go into API URLs and check the shape of
 * every response before the app uses it.
 */

export const isLeagueId = (s: unknown): s is string =>
  typeof s === "string" && /^\d{5,25}$/.test(s);

export const isUsername = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_.-]{2,40}$/.test(s);

/**
 * A username as typed or pasted, in the form Sleeper looks up: without the
 * "@" of a handle, the spaces around it or the invisible characters some apps
 * add when copying, and in lowercase (Sleeper ignores case, and one spelling
 * per user keeps its cached answers the same).
 */
export const normalizeUsername = (s: string): string =>
  s
    .replace(/\p{Cf}/gu, "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

export class ResponseShapeError extends Error {
  constructor(what: string) {
    super(`Unexpected response from Sleeper (${what}).`);
    this.name = "ResponseShapeError";
  }
}

type Json = Record<string, unknown>;

const isObject = (x: unknown): x is Json =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const num = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isFinite(x) ? x : undefined;
/** Sleeper sends IDs as strings, but numbers are accepted and converted. */
const id = (x: unknown): string | undefined =>
  typeof x === "string" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : undefined;
const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.flatMap((v) => (id(v) === undefined ? [] : [id(v)!])) : [];

export interface SleeperUser {
  user_id: string;
  display_name: string;
}

/** Sleeper answers `null` for unknown usernames. */
export function parseUser(x: unknown): SleeperUser | null {
  if (x === null) return null;
  if (!isObject(x)) throw new ResponseShapeError("user");
  const userId = id(x.user_id);
  if (!userId) return null;
  return { user_id: userId, display_name: str(x.display_name) ?? "" };
}

export interface SleeperState {
  season: string;
}

export function parseState(x: unknown): SleeperState {
  if (!isObject(x)) throw new ResponseShapeError("season state");
  const season = id(x.league_season) ?? id(x.season);
  if (!season || !/^\d{4}$/.test(season)) throw new ResponseShapeError("season state");
  return { season };
}

export interface LeagueSummary {
  league_id: string;
  name: string;
  total_rosters: number | undefined;
}

export function parseLeagueList(x: unknown): LeagueSummary[] {
  if (x === null) return [];
  if (!Array.isArray(x)) throw new ResponseShapeError("league list");
  return x.flatMap((l) => {
    if (!isObject(l)) return [];
    const leagueId = id(l.league_id);
    if (!isLeagueId(leagueId)) return [];
    return [
      {
        league_id: leagueId,
        name: str(l.name) ?? "Unnamed league",
        total_rosters: num(l.total_rosters),
      },
    ];
  });
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  /** Sleeper's sport id (nfl, nba); "nfl" when missing. */
  sport: string;
  season: string;
  total_rosters: number | undefined;
  roster_positions: string[];
  scoring_settings: Record<string, number>;
  settings: {
    num_teams?: number;
    type?: number;
    playoff_week_start?: number;
    playoff_teams?: number;
    playoff_round_type?: number;
    /** The last week with final scores. */
    last_scored_leg?: number;
    /** 1 when every team also plays the week's median score. */
    league_average_match?: number;
  };
}

/** Sleeper answers `null` for unknown leagues. */
export function parseLeague(x: unknown): SleeperLeague | null {
  if (x === null) return null;
  if (!isObject(x)) throw new ResponseShapeError("league");
  const leagueId = id(x.league_id);
  if (!isLeagueId(leagueId)) return null;
  const scoring: Record<string, number> = {};
  if (isObject(x.scoring_settings)) {
    for (const [k, v] of Object.entries(x.scoring_settings)) {
      const n = num(v);
      if (n !== undefined) scoring[k] = n;
    }
  }
  const settings = isObject(x.settings) ? x.settings : {};
  return {
    league_id: leagueId,
    name: str(x.name) ?? "Unnamed league",
    sport: str(x.sport) ?? "nfl",
    season: id(x.season) ?? "",
    total_rosters: num(x.total_rosters),
    roster_positions: strings(x.roster_positions),
    scoring_settings: scoring,
    settings: {
      num_teams: num(settings.num_teams),
      type: num(settings.type),
      playoff_week_start: num(settings.playoff_week_start),
      playoff_teams: num(settings.playoff_teams),
      playoff_round_type: num(settings.playoff_round_type),
      last_scored_leg: num(settings.last_scored_leg),
      league_average_match: num(settings.league_average_match),
    },
  };
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  co_owners: string[];
  players: string[];
  /** Players in the injured reserve slots; null when the data does not say (not Sleeper's empty null). */
  reserve: string[] | null;
  wins: number;
  losses: number;
  ties: number;
  /** Points for so far (Sleeper splits them into whole and hundredths). */
  fpts: number;
}

export function parseRosters(x: unknown): SleeperRoster[] {
  if (!Array.isArray(x)) throw new ResponseShapeError("rosters");
  return x.flatMap((r) => {
    if (!isObject(r)) return [];
    const rosterId = num(r.roster_id);
    if (rosterId === undefined || !Number.isInteger(rosterId)) return [];
    const s = isObject(r.settings) ? r.settings : {};
    return [
      {
        roster_id: rosterId,
        owner_id: id(r.owner_id) ?? null,
        co_owners: strings(r.co_owners),
        players: strings(r.players),
        reserve: r.reserve === undefined ? null : strings(r.reserve),
        wins: num(s.wins) ?? 0,
        losses: num(s.losses) ?? 0,
        ties: num(s.ties) ?? 0,
        fpts: (num(s.fpts) ?? 0) + (num(s.fpts_decimal) ?? 0) / 100,
      },
    ];
  });
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  team_name: string | undefined;
}

export function parseLeagueUsers(x: unknown): SleeperLeagueUser[] {
  if (!Array.isArray(x)) throw new ResponseShapeError("league users");
  return x.flatMap((u) => {
    if (!isObject(u)) return [];
    const userId = id(u.user_id);
    if (!userId) return [];
    const meta = isObject(u.metadata) ? u.metadata : {};
    return [
      {
        user_id: userId,
        display_name: str(u.display_name) ?? str(u.username) ?? "",
        team_name: str(meta.team_name) || undefined,
      },
    ];
  });
}

/** One team's game in one week. */
export interface SleeperMatchup {
  roster_id: number;
  /** Shared by the two teams of a game; null when the team has no game that week. */
  matchup_id: number | null;
  points: number;
  /** The players it started that week. */
  starters: string[];
  /** Each player's points that week. */
  players_points: Record<string, number>;
}

const numbers = (x: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (isObject(x)) {
    for (const [k, v] of Object.entries(x)) {
      const n = num(v);
      if (n !== undefined) out[k] = n;
    }
  }
  return out;
};

export function parseMatchups(x: unknown): SleeperMatchup[] {
  if (!Array.isArray(x)) throw new ResponseShapeError("matchups");
  return x.flatMap((m) => {
    if (!isObject(m)) return [];
    const rosterId = num(m.roster_id);
    if (rosterId === undefined || !Number.isInteger(rosterId)) return [];
    return [
      {
        roster_id: rosterId,
        matchup_id: num(m.matchup_id) ?? null,
        points: num(m.points) ?? 0,
        starters: strings(m.starters),
        players_points: numbers(m.players_points),
      },
    ];
  });
}

/** A completed trade: who got which players, draft picks and FAAB. */
export interface SleeperTrade {
  transaction_id: string;
  /** The week it went through. */
  leg: number;
  /** When, in milliseconds since 1970. */
  created: number;
  roster_ids: number[];
  /** Player ID to the roster that received him. */
  adds: Record<string, number>;
  draft_picks: { season: string; round: number; owner_id: number }[];
  waiver_budget: { receiver: number; amount: number }[];
}

/** The completed trades in one week's transactions; waivers, signings and failed trades left out. */
export function parseTrades(x: unknown): SleeperTrade[] {
  if (!Array.isArray(x)) throw new ResponseShapeError("transactions");
  return x.flatMap((t) => {
    if (!isObject(t) || t.type !== "trade" || t.status !== "complete") return [];
    const transactionId = id(t.transaction_id);
    const leg = num(t.leg);
    if (!transactionId || leg === undefined) return [];
    const rosterIds = Array.isArray(t.roster_ids)
      ? t.roster_ids.filter((r): r is number => num(r) !== undefined)
      : [];
    const picks = Array.isArray(t.draft_picks) ? t.draft_picks.filter(isObject) : [];
    const faab = Array.isArray(t.waiver_budget) ? t.waiver_budget.filter(isObject) : [];
    return [
      {
        transaction_id: transactionId,
        leg,
        created: num(t.created) ?? 0,
        roster_ids: rosterIds,
        adds: numbers(t.adds),
        draft_picks: picks.flatMap((d) => {
          const round = num(d.round);
          const owner = num(d.owner_id);
          const season = id(d.season);
          return round === undefined || owner === undefined || !season
            ? []
            : [{ season, round, owner_id: owner }];
        }),
        waiver_budget: faab.flatMap((w) => {
          const receiver = num(w.receiver);
          const amount = num(w.amount);
          return receiver === undefined || amount === undefined ? [] : [{ receiver, amount }];
        }),
      },
    ];
  });
}
