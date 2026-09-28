import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { absentKeyTeammate, formWithReturn, lastTeamWeek, type RosterView } from "./teammates";

const params = { ...NFL.model, teammateReturn: 0.8, keyTeammatePpg: 10 };

const view = (id: string, extra: Partial<RosterView>): RosterView => ({
  id,
  name: id,
  pos: "WR",
  team: "AAA",
  inj: null,
  prior: 12,
  teamByWeek: { "1": "AAA", "2": "AAA", "3": "AAA" },
  ...extra,
});

describe("absentKeyTeammate", () => {
  const me = view("me", { prior: 11 });
  const star = view("star", { prior: 18, inj: "Out", teamByWeek: { "1": "AAA" } });
  const depth = view("depth", { prior: 6, inj: "Out", teamByWeek: { "1": "AAA" } });
  const team = [me, star, depth];

  it("finds the key teammate who missed the last game and is expected back", () => {
    expect(lastTeamWeek(team).get("AAA")).toBe(3);
    expect(absentKeyTeammate(me, team, 3, params)).toEqual({
      id: "star",
      name: "star",
      returnChance: 0.8,
    });
  });

  it("expects longer absences to cost more games", () => {
    const onIr = view("star", { prior: 18, inj: "IR", teamByWeek: { "1": "AAA" } });
    expect(absentKeyTeammate(me, [me, onIr], 3, params)?.returnChance).toBeCloseTo(0.48);
  });

  it("ignores teammates without an injury status (cut, benched, traded)", () => {
    const gone = view("gone", { prior: 18, teamByWeek: { "1": "AAA" } });
    expect(absentKeyTeammate(me, [me, gone], 3, params)).toBeNull();
  });

  it("ignores minor teammates and is off when the chance is 0", () => {
    expect(absentKeyTeammate(me, [me, depth], 3, params)).toBeNull();
    expect(absentKeyTeammate(me, team, 3, { ...params, teammateReturn: 0 })).toBeNull();
  });
});

describe("formWithReturn", () => {
  const star = view("star", { prior: 18, inj: "Out", teamByWeek: { "1": "AAA" } });

  it("mixes games with and without the teammate by his chance to play", () => {
    // Week 1 with him (8 points), weeks 2-3 without (20 and 22).
    const r = formWithReturn([8, 20, 22], [1, 2, 3], star, "AAA", 0.75, 11, 3)!;
    expect(r.seasonAvg).toBeCloseTo(0.75 * 8 + 0.25 * 21);
  });

  it("uses the prior when they have not played together yet", () => {
    const always = view("star", { prior: 18, inj: "Out", teamByWeek: {} });
    const r = formWithReturn([20, 22], [2, 3], always, "AAA", 0.5, 12, 3)!;
    expect(r.seasonAvg).toBeCloseTo(0.5 * 12 + 0.5 * 21);
  });
});
