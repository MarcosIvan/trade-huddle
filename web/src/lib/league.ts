import type { SportConfig } from "./sports/types";
import type { SleeperLeague, SleeperLeagueUser, SleeperRoster } from "./sleeper/validate";

export interface Team {
  rid: number;
  name: string;
  /** The owner's Sleeper username, when the team has its own name (null when the name is the username). */
  handle: string | null;
  ownerId: string | null;
  coOwners: string[];
  playerIds: string[];
  record: string;
}

/** Rosters with display names: team name, then display name, then "Team N". */
export function buildTeams(rosters: SleeperRoster[], users: SleeperLeagueUser[]): Team[] {
  const byId = new Map(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const owner = r.owner_id ? byId.get(r.owner_id) : undefined;
    const name = owner?.team_name || owner?.display_name || `Team ${r.roster_id}`;
    return {
      rid: r.roster_id,
      name,
      handle: owner?.display_name && owner.display_name !== name ? owner.display_name : null,
      ownerId: r.owner_id,
      coOwners: r.co_owners,
      playerIds: r.players,
      record: `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`,
    };
  });
}

/** "Team name (@username)" for lists and labels; just the name when there is no handle. */
export const teamLabel = (t: Pick<Team, "name" | "handle">): string =>
  t.handle ? `${t.name} (@${t.handle})` : t.name;

/** The visitor's team: an explicit choice, then their user ID, then the first team. */
export function pickMyTeam(
  teams: Team[],
  preferred: number | null,
  userId: string | null,
): number | null {
  if (preferred !== null && teams.some((t) => t.rid === preferred)) return preferred;
  if (userId) {
    const owned = teams.find((t) => t.ownerId === userId || t.coOwners.includes(userId));
    if (owned) return owned.rid;
  }
  return teams[0]?.rid ?? null;
}

export type NoticeKind = "demo" | "dynasty" | "keeper" | "idp";

/** Things the visitor should know about how the site treats this league. */
export function leagueNotices(
  league: SleeperLeague,
  sport: SportConfig,
  demo: boolean,
): NoticeKind[] {
  const notices: NoticeKind[] = [];
  if (demo) notices.push("demo");
  // Sleeper league types: 0 redraft, 1 keeper, 2 dynasty.
  if (league.settings.type === 2) notices.push("dynasty");
  if (league.settings.type === 1) notices.push("keeper");
  if (league.roster_positions.some((s) => sport.unsupportedSlots.includes(s))) notices.push("idp");
  return notices;
}
