import { describe, expect, it } from "vitest";
import { adjustForSchedule, scheduleValues } from "./scheduleValue";
import type { Model, Player, StatsFile } from "./types";

/**
 * Four team defenses; weeks 1-2 played. A defense facing DDD's offense scores
 * 20, any other 10: DDD gives 1.6 times the average to defenses, the others
 * 0.8. Weeks 3-6 are left: AAA, BBB and CCC each face DDD once, DDD never.
 */
const POINTS: Record<string, [number, number]> = {
  AAA: [10, 10],
  BBB: [10, 20],
  CCC: [20, 10],
  DDD: [10, 10],
};

const defense = (team: string, value: number, extra: Partial<Player> = {}) =>
  ({
    id: team,
    name: team,
    pos: "DEF",
    team,
    noTeam: false,
    value,
    weekly: (POINTS[team] ?? []).map((pts, i) => ({ week: i + 1, pts })),
    ...extra,
  }) as unknown as Player;

const players = (values: Record<string, number>, extra: Player[] = []) =>
  ({
    players: Object.fromEntries(
      [...Object.entries(values).map(([t, v]) => defense(t, v)), ...extra].map((p) => [p.id, p]),
    ),
  }) as unknown as Pick<Model, "players">;

const stats = {
  weeks: [1, 2],
  lineup_week: 3,
  schedule: {
    "1": [
      ["AAA", "BBB"],
      ["CCC", "DDD"],
    ],
    "2": [
      ["AAA", "CCC"],
      ["BBB", "DDD"],
    ],
    "3": [["AAA", "DDD"]],
    "4": [["BBB", "CCC"]],
    "5": [
      ["AAA", "BBB"],
      ["CCC", "DDD"],
    ],
    "6": [
      ["AAA", "CCC"],
      ["BBB", "DDD"],
    ],
  },
  players: Object.fromEntries(Object.keys(POINTS).map((t) => [t, { tw: { "1": t, "2": t } }])),
} as unknown as StatsFile;

const params = (rule = { regress: 1, elasticity: 1 }) => ({
  scheduleValue: { DEF: rule },
  matchupShrinkGames: 0,
  matchupShrinkByPos: {},
});

describe("adjustForSchedule", () => {
  it("keeps a share of the gap to the average, then scales by the factor", () => {
    expect(adjustForSchedule(10, 6, 1, { regress: 0.5, elasticity: 1 })).toBe(8);
    expect(adjustForSchedule(10, 6, 1.2, { regress: 1, elasticity: 1 })).toBeCloseTo(12);
    expect(adjustForSchedule(10, 6, 1.2, { regress: 1, elasticity: 2 })).toBeCloseTo(14.4);
    expect(adjustForSchedule(10, 6, 1.2, { regress: 1, elasticity: 0 })).toBe(10);
  });

  it("never goes below zero", () => {
    expect(adjustForSchedule(0, 6, 1, { regress: 2, elasticity: 1 })).toBe(0);
  });
});

describe("scheduleValues", () => {
  const even = { AAA: 8, BBB: 8, CCC: 8, DDD: 8 };

  it("rates each defense by the offenses it still faces", () => {
    const out = scheduleValues(players(even), stats, {}, params());
    // AAA, BBB and CCC each face DDD once: (1.6 + 0.8 + 0.8) / 3. DDD faces only 0.8s.
    expect(out.get("AAA")).toBeCloseTo((8 * 3.2) / 3);
    expect(out.get("BBB")).toBeCloseTo(out.get("AAA")!);
    expect(out.get("DDD")).toBeCloseTo(8 * 0.8);
  });

  it("pulls values toward the position's average", () => {
    const out = scheduleValues(
      players({ AAA: 12, BBB: 8, CCC: 8, DDD: 4 }),
      stats,
      {},
      params({ regress: 0.5, elasticity: 0 }),
    );
    expect(out.get("AAA")).toBe(10);
    expect(out.get("BBB")).toBe(8);
    expect(out.get("DDD")).toBe(6);
  });

  it("only counts the league's fantasy weeks", () => {
    // Playoffs in weeks 3-4 only: weeks 5 and 6 are past the fantasy season.
    const league = { settings: { playoff_week_start: 3, playoff_teams: 4 } };
    const out = scheduleValues(players(even), stats, league, params());
    expect(out.get("AAA")).toBeCloseTo(8 * 1.6); // faces DDD in week 3
    expect(out.get("BBB")).toBeCloseTo(8 * 0.8); // faces CCC in week 4
  });

  it("leaves out players without a team and positions without a rule", () => {
    const rb = { ...defense("r1", 15), pos: "RB" } as Player;
    const free = defense("FA", 3, { noTeam: true, team: "" });
    const out = scheduleValues(players(even, [rb, free]), stats, {}, params());
    expect(out.has("r1")).toBe(false);
    expect(out.has("FA")).toBe(false);
  });

  it("does nothing without rules or before the first games", () => {
    expect(scheduleValues(players(even), stats, {}, { ...params(), scheduleValue: {} }).size).toBe(
      0,
    );
    expect(scheduleValues(players(even), { ...stats, weeks: [] }, {}, params()).size).toBe(0);
  });
});
