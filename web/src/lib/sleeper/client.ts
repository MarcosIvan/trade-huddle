import {
  isLeagueId,
  isUsername,
  parseLeague,
  parseLeagueList,
  parseLeagueUsers,
  parseRosters,
  parseState,
  parseUser,
  ResponseShapeError,
  type LeagueSummary,
  type SleeperLeague,
  type SleeperLeagueUser,
  type SleeperRoster,
  type SleeperUser,
} from "./validate";

export const SLEEPER_API = "https://api.sleeper.app/v1";

/** An error whose message can be shown to the visitor as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

async function get(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(SLEEPER_API + path, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new UserError("Could not reach Sleeper. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new UserError(`Sleeper returned an error (${response.status}). Try again in a minute.`);
  }
  try {
    return await response.json();
  } catch {
    throw new ResponseShapeError("not JSON");
  }
}

export async function findUser(username: string, signal?: AbortSignal): Promise<SleeperUser> {
  if (!isUsername(username)) {
    throw new UserError(
      "Enter a valid Sleeper username (letters, numbers, dots, dashes or underscores).",
    );
  }
  const user = parseUser(await get(`/user/${encodeURIComponent(username)}`, signal));
  if (!user) {
    throw new UserError(
      `No Sleeper user named "${username}". Check the spelling: it is your profile username, not your team name.`,
    );
  }
  return user;
}

export async function currentSeason(signal?: AbortSignal): Promise<string> {
  return parseState(await get("/state/nfl", signal)).season;
}

export async function userLeagues(
  userId: string,
  season: string,
  signal?: AbortSignal,
): Promise<LeagueSummary[]> {
  return parseLeagueList(
    await get(
      `/user/${encodeURIComponent(userId)}/leagues/nfl/${encodeURIComponent(season)}`,
      signal,
    ),
  );
}

export interface LeagueData {
  league: SleeperLeague;
  rosters: SleeperRoster[];
  users: SleeperLeagueUser[];
}

export async function fetchLeague(leagueId: string, signal?: AbortSignal): Promise<LeagueData> {
  if (!isLeagueId(leagueId)) throw new UserError("That league link is not valid.");
  const base = `/league/${encodeURIComponent(leagueId)}`;
  const [league, rosters, users] = await Promise.all([
    get(base, signal).then(parseLeague),
    get(`${base}/rosters`, signal).then(parseRosters),
    get(`${base}/users`, signal).then(parseLeagueUsers),
  ]);
  if (!league) throw new UserError("League not found. Check the league ID or link.");
  return { league, rosters, users };
}
