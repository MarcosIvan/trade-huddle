import { describe, expect, it } from "vitest";
import { NBA } from "../sports/nba";
import { NFL } from "../sports/nfl";
import type { Player, StatsFile } from "./types";
import { weekStrength, weekValue } from "./weekStrength";

const player = (id: string, pos: string, team: string, value: number) =>
  ({ id, name: id, pos, elig: [pos], team, value, vorp: 0, startable: true }) as unknown as Player;

describe("weekStrength", () => {
  // AAA plays weeks 10 and 12 and is on a bye in week 11.
  const nfl = {
    schedule: {
      "10": [["AAA", "BBB"]],
      "11": [["CCC", "BBB"]],
      "12": [["BBB", "AAA"]],
    },
  } as unknown as StatsFile;
  const roster = [player("star", "RB", "AAA", 20), player("backup", "RB", "BBB", 8)];

  it("starts the best player with a game", () => {
    expect(weekStrength(roster, nfl, 10, ["RB"], NFL)).toBe(20);
  });

  it("lets the bench fill in for a player on a bye", () => {
    expect(weekStrength(roster, nfl, 11, ["RB"], NFL)).toBe(8);
  });

  it("is null for a week the schedule does not have", () => {
    expect(weekStrength(roster, nfl, 13, ["RB"], NFL)).toBeNull();
  });

  it("adds up every game day of an NBA week", () => {
    const nba = {
      period: "day",
      // Week 1: days 1-3; AAA plays days 1 and 3, BBB only day 2.
      day_weeks: { "1": 1, "2": 1, "3": 1, "4": 2 },
      schedule: {
        "1": [["AAA", "CCC"]],
        "2": [["BBB", "CCC"]],
        "3": [["CCC", "AAA"]],
        "4": [["BBB", "AAA"]],
      },
    } as unknown as StatsFile;
    const two = [player("a", "PG", "AAA", 30), player("b", "PG", "BBB", 25)];
    expect(weekStrength(two, nba, 1, ["PG"], NBA)).toBe(30 + 25 + 30);
    expect(weekStrength(two, nba, 2, ["PG"], NBA)).toBe(30);
  });
});

describe("weekValue", () => {
  const p = (extra: Partial<Player>) =>
    ({ ...player("x", "RB", "AAA", 18), injMult: 1, ...extra }) as Player;
  const params = NFL.model;

  it("takes a player out for the lineup week only, then back at full value", () => {
    const out = p({ inj: "Out", value: 18, injMult: 0.9 });
    expect(weekValue(out, 11, 11, params)).toBe(0);
    expect(weekValue(out, 12, 11, params)).toBeCloseTo(20);
  });

  it("weighs a questionable player by his chance to play this week", () => {
    expect(weekValue(p({ inj: "Questionable" }), 11, 11, params)).toBeCloseTo(18 * 0.85);
  });

  it("brings a player on IR back later at the model's discounted value", () => {
    const ir = p({ inj: "IR", value: 9, injMult: 0.5, startable: false });
    expect(weekValue(ir, 11, 11, params)).toBe(0);
    expect(weekValue(ir, 12, 11, params)).toBe(9);
  });

  it("gives nothing for a season-ending injury or a player with no team", () => {
    expect(weekValue(p({ inj: "IR", startable: false, seasonOver: true }), 12, 11, params)).toBe(0);
    expect(weekValue(p({ noTeam: true, startable: false }), 12, 11, params)).toBe(0);
  });
});
