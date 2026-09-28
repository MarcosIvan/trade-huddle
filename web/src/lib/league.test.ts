import { describe, expect, it } from "vitest";
import { buildTeams, leagueNotices, pickMyTeam } from "./league";
import { NFL } from "./sports/nfl";
import type { SleeperLeague, SleeperRoster } from "./sleeper/validate";

const roster = (
  rid: number,
  owner: string | null,
  extra: Partial<SleeperRoster> = {},
): SleeperRoster => ({
  roster_id: rid,
  owner_id: owner,
  co_owners: [],
  players: [],
  wins: 0,
  losses: 0,
  ties: 0,
  ...extra,
});

describe("buildTeams", () => {
  it("names teams by team name, then display name, then number", () => {
    const teams = buildTeams(
      [roster(1, "a", { wins: 3, losses: 1 }), roster(2, "b", { ties: 1 }), roster(3, null)],
      [
        { user_id: "a", display_name: "alice", team_name: "Sharks" },
        { user_id: "b", display_name: "bob", team_name: undefined },
      ],
    );
    expect(teams.map((t) => [t.name, t.record])).toEqual([
      ["Sharks", "3-1"],
      ["bob", "0-0-1"],
      ["Team 3", "0-0"],
    ]);
  });
});

describe("pickMyTeam", () => {
  const teams = buildTeams([roster(1, "a"), roster(2, "b", { co_owners: ["c"] })], []);

  it("prefers an explicit choice that exists", () => {
    expect(pickMyTeam(teams, 2, "a")).toBe(2);
    expect(pickMyTeam(teams, 99, "a")).toBe(1);
  });

  it("finds the visitor's team as owner or co-owner", () => {
    expect(pickMyTeam(teams, null, "b")).toBe(2);
    expect(pickMyTeam(teams, null, "c")).toBe(2);
  });

  it("falls back to the first team", () => {
    expect(pickMyTeam(teams, null, "stranger")).toBe(1);
    expect(pickMyTeam([], null, null)).toBeNull();
  });
});

describe("leagueNotices", () => {
  const league = (type: number, slots: string[] = ["QB"]): SleeperLeague => ({
    league_id: "12345",
    name: "L",
    season: "2026",
    total_rosters: 12,
    roster_positions: slots,
    scoring_settings: {},
    settings: { type },
  });

  it("flags demo, dynasty, keeper and IDP leagues", () => {
    expect(leagueNotices(league(0), NFL, false)).toEqual([]);
    expect(leagueNotices(league(0), NFL, true)).toEqual(["demo"]);
    expect(leagueNotices(league(2), NFL, false)).toEqual(["dynasty"]);
    expect(leagueNotices(league(1), NFL, false)).toEqual(["keeper"]);
    expect(leagueNotices(league(0, ["QB", "LB"]), NFL, false)).toEqual(["idp"]);
  });
});
