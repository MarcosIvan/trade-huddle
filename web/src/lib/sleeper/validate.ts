/**
 * Everything that comes from Sleeper or from the URL is untrusted. These
 * helpers check inputs before they go into API URLs and check the shape of
 * every response before the app uses it.
 */

export const isLeagueId = (s: unknown): s is string =>
  typeof s === "string" && /^\d{5,25}$/.test(s);

export const isUsername = (s: unknown): s is string =>
  typeof s === "string" && /^[A-Za-z0-9_.-]{2,40}$/.test(s);

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
  settings: { num_teams?: number; type?: number };
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
    settings: { num_teams: num(settings.num_teams), type: num(settings.type) },
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
