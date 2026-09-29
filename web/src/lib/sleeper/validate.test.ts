import { describe, expect, it } from "vitest";
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
} from "./validate";

describe("input validation", () => {
  it.each(["12345", "1234567890123456789"])("accepts league ID %s", (id) => {
    expect(isLeagueId(id)).toBe(true);
  });

  it.each(["1234", "../../x", "12345/../1", "12345 ", "", "1".repeat(26)])(
    "rejects league ID %j",
    (id) => {
      expect(isLeagueId(id)).toBe(false);
    },
  );

  it.each(["coach_01", "a.b-c", "AB"])("accepts username %s", (name) => {
    expect(isUsername(name)).toBe(true);
  });

  it.each(["a", "has space", "x/y", "<img>", "é", "a".repeat(41)])(
    "rejects username %j",
    (name) => {
      expect(isUsername(name)).toBe(false);
    },
  );
});

describe("response validation", () => {
  it("reads a user, and null for unknown usernames", () => {
    expect(parseUser({ user_id: "42", display_name: "Coach" })).toEqual({
      user_id: "42",
      display_name: "Coach",
    });
    expect(parseUser(null)).toBeNull();
    expect(() => parseUser("nope")).toThrow(ResponseShapeError);
  });

  it("requires a four-digit season", () => {
    expect(parseState({ season: "2026", league_season: "2026" })).toEqual({ season: "2026" });
    expect(() => parseState({ season: "../x" })).toThrow(ResponseShapeError);
  });

  it("drops leagues with invalid IDs", () => {
    const list = parseLeagueList([
      { league_id: "12345", name: "Good", total_rosters: 12 },
      { league_id: "../../x", name: "Bad" },
      "junk",
    ]);
    expect(list).toEqual([{ league_id: "12345", name: "Good", total_rosters: 12 }]);
    expect(parseLeagueList(null)).toEqual([]);
  });

  it("keeps only numeric scoring rules and string slots", () => {
    const league = parseLeague({
      league_id: "12345",
      name: "L",
      season: "2026",
      roster_positions: ["QB", 7, null, "FLEX"],
      scoring_settings: { rec: 1, pass_td: "4", bad: null },
      settings: { type: 2, num_teams: 10 },
    });
    expect(league).toMatchObject({
      roster_positions: ["QB", "7", "FLEX"],
      scoring_settings: { rec: 1 },
      settings: { type: 2, num_teams: 10 },
    });
    expect(parseLeague(null)).toBeNull();
    expect(parseLeague({ league_id: "x" })).toBeNull();
  });

  it("reads rosters and skips malformed ones", () => {
    const rosters = parseRosters([
      { roster_id: 1, owner_id: "u1", players: ["10", 11], settings: { wins: 3, losses: 1 } },
      { roster_id: "2" },
      { roster_id: 3, owner_id: null, players: null },
    ]);
    expect(rosters).toEqual([
      {
        roster_id: 1,
        owner_id: "u1",
        co_owners: [],
        players: ["10", "11"],
        wins: 3,
        losses: 1,
        ties: 0,
      },
      { roster_id: 3, owner_id: null, co_owners: [], players: [], wins: 0, losses: 0, ties: 0 },
    ]);
    expect(() => parseRosters({})).toThrow(ResponseShapeError);
  });

  it("keeps team names as plain text", () => {
    const [user] = parseLeagueUsers([
      {
        user_id: "u1",
        display_name: "coach",
        metadata: { team_name: '<img src=x onerror="alert(1)">' },
      },
    ]);
    // Stored as text; React renders it escaped. It is never used as HTML, a URL or a style.
    expect(user?.team_name).toBe('<img src=x onerror="alert(1)">');
  });
});
