import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { buildModel } from "./build";
import type { StatsFile, StatsPlayer } from "./types";
import { defenseFactors, opponents, weeklyOutlook } from "./weekly";

// Two weeks played. Receivers of AAA and CCC face BBB (a soft defense) and DDD (a tough one).
const keys = ["rec_yd"];
const wr = (team: string, yards: number[], extra: Partial<StatsPlayer> = {}): StatsPlayer => ({
  n: `${team} receiver`,
  p: "WR",
  fp: ["WR"],
  t: team,
  prev: { g: 16, s: [0, 1000] },
  w: Object.fromEntries(yards.map((y, i) => [String(i + 1), [0, y]])),
  tw: Object.fromEntries(yards.map((_, i) => [String(i + 1), team])),
  ...extra,
});
const stats: StatsFile = {
  generated_at: "2026-10-01T00:00:00+00:00",
  season: "2026",
  prev_season: "2025",
  weeks: [1, 2],
  keys,
  schedule: {
    "1": [
      ["AAA", "BBB"],
      ["CCC", "DDD"],
    ],
    "2": [
      ["CCC", "BBB"],
      ["AAA", "DDD"],
    ],
    "3": [["AAA", "BBB"]],
  },
  lineup_week: 3,
  players: {
    a: wr("AAA", [150, 50], { wp: { "3": [0, 120] } }),
    c: wr("CCC", [50, 150]),
    hurt: wr("AAA", [100, 100], { i: "Out" }),
    maybe: wr("AAA", [100, 100], { i: "Questionable" }),
  },
};
const league = { roster_positions: ["WR"], scoring_settings: { rec_yd: 0.1 }, total_rosters: 1 };
const model = buildModel(stats, league, NFL);

describe("opponents", () => {
  it("knows who plays whom and where", () => {
    const week3 = opponents(stats, 3);
    expect(week3.get("AAA")).toEqual({ opponent: "BBB", home: false });
    expect(week3.get("BBB")).toEqual({ opponent: "AAA", home: true });
    expect(week3.has("CCC")).toBe(false); // bye
  });
});

describe("defenseFactors", () => {
  it("rates defenses by points allowed to the position, pulled toward average", () => {
    const raw = defenseFactors(model, stats, 0);
    // In two games each, BBB allowed 50 points to receivers and DDD 30.
    expect(raw.get("BBB")!.get("WR")!).toBeGreaterThan(1);
    expect(raw.get("DDD")!.get("WR")!).toBeLessThan(1);
    const shrunk = defenseFactors(model, stats, 100);
    expect(Math.abs(shrunk.get("BBB")!.get("WR")! - 1)).toBeLessThan(
      Math.abs(raw.get("BBB")!.get("WR")! - 1),
    );
  });
});

describe("weeklyOutlook", () => {
  const params = { ...NFL.model, weekProjWeight: 0, matchupWeight: 1, matchupShrinkGames: 0 };

  it("gives nothing on a bye or when out", () => {
    const out = weeklyOutlook(model, stats, league, 3, params);
    expect(out.get("c")).toMatchObject({ pts: 0, bye: true });
    expect(out.get("hurt")).toMatchObject({ pts: 0, availability: 0, bye: false });
  });

  it("raises a player facing a soft defense", () => {
    const out = weeklyOutlook(model, stats, league, 3, params);
    const a = out.get("a")!;
    const player = model.players.a!;
    expect(a.opponent).toBe("BBB");
    expect(a.pts).toBeGreaterThan(player.value);
  });

  it("discounts a questionable player by his chance to play", () => {
    const out = weeklyOutlook(model, stats, league, 3, { ...params, matchupWeight: 0 });
    const maybe = model.players.maybe!;
    expect(out.get("maybe")!.pts).toBeCloseTo((maybe.value / maybe.injMult) * 0.85);
  });

  it("blends in Sleeper's weekly projection", () => {
    const only = weeklyOutlook(model, stats, league, 3, { ...params, weekProjWeight: 1 });
    expect(only.get("a")!.pts).toBeCloseTo(12); // 120 yards x 0.1
  });
});
