import { parsePlayerNews, type NewsItem } from "../news";
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

const SLEEPER_HOST = "https://api.sleeper.app";
export const SLEEPER_API = `${SLEEPER_HOST}/v1`;

/** An error whose message can be shown to the visitor as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

async function get(path: string, signal?: AbortSignal, base = SLEEPER_API): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(base + path, {
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

/** Sleeper player IDs: digits, or a team code for defenses. */
const isPlayerId = (s: string) => /^[A-Za-z0-9]{1,12}$/.test(s);

/**
 * A player's latest news, the feed Sleeper's own app shows (outside the
 * documented /v1 API, so a change there only empties the news dialog).
 */
export async function playerNews(
  sport: string,
  playerId: string,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  if (!/^[a-z]{2,5}$/.test(sport) || !isPlayerId(playerId)) return [];
  return parsePlayerNews(await get(`/players/${sport}/${playerId}/news`, signal, SLEEPER_HOST));
}
