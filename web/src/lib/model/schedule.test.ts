import { describe, expect, it } from "vitest";
import { byeWeeks, playerSchedules, playoffWeeks, scheduleNote } from "./schedule";
import type { Model, Player, StatsFile } from "./types";

/**
 * Four teams, one RB each; weeks 1-2 played. Whoever faces DDD scores 20,
 * everyone else 10: DDD allows 1.6 times the average to RBs, the others 0.8.
 * Byes: BBB and CCC in week 3, AAA and DDD in week 4.
 */
const POINTS: Record<string, [number, number]> = {
  a1: [10, 10],
  b1: [10, 20],
  c1: [20, 10],
  d1: [10, 10],
};
const TEAMS: Record<string, string> = { a1: "AAA", b1: "BBB", c1: "CCC", d1: "DDD" };

const player = (id: string, extra: Partial<Player> = {}) =>
  ({
    id,
    name: id,
    pos: "RB",
    team: TEAMS[id] ?? "",
    noTeam: false,
    weekly: (POINTS[id] ?? []).map((pts, i) => ({ week: i + 1, pts })),
    ...extra,
  }) as unknown as Player;

const model = {
  players: Object.fromEntries(
    ["a1", "b1", "c1", "d1"]
      .map((id) => player(id))
      .concat(player("free", { noTeam: true }))
      .map((p) => [p.id, p]),
  ),
} as unknown as Model;

const nfl = {
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
  players: Object.fromEntries(Object.entries(TEAMS).map(([id, t]) => [id, { tw: { 1: t, 2: t } }])),
} as unknown as StatsFile;

const NO_SHRINK = { matchupShrinkGames: 0 };
/** Playoffs in weeks 5 and 6 (four teams, two rounds). */
const LEAGUE = { settings: { playoff_week_start: 5, playoff_teams: 4 } };

describe("playoffWeeks", () => {
  it("reads Sleeper's start week, teams and round type", () => {
    const weeks = (settings: object) => playoffWeeks({ settings });
    expect(weeks({ playoff_week_start: 15, playoff_teams: 6 })).toEqual([15, 16, 17]);
    expect(weeks({ playoff_week_start: 15, playoff_teams: 4 })).toEqual([15, 16]);
    // A two-week final, then two weeks per round.
    expect(weeks({ playoff_week_start: 14, playoff_teams: 4, playoff_round_type: 1 })).toEqual([
      14, 15, 16,
    ]);
    expect(weeks({ playoff_week_start: 14, playoff_teams: 4, playoff_round_type: 2 })).toEqual([
      14, 15, 16, 17,
    ]);
  });

  it("is empty when the league does not say", () => {
    expect(playoffWeeks({})).toEqual([]);
  });
});

describe("byeWeeks", () => {
  it("finds the one week each team has no game", () => {
    expect(Object.fromEntries(byeWeeks(nfl))).toEqual({ AAA: 4, BBB: 3, CCC: 3, DDD: 4 });
  });

  it("has none with game days (the NBA)", () => {
    expect(byeWeeks({ ...nfl, period: "day" }).size).toBe(0);
  });
});

describe("playerSchedules", () => {
  const s = playerSchedules(model, nfl, LEAGUE, NO_SHRINK);

  it("rates the regular season's opponents left by what they allowed to the position", () => {
    // Weeks 3-4: AAA meets only DDD (1.6); DDD meets only AAA (0.8).
    expect(s.get("a1")!.regular).toMatchObject({ games: 1, good: 1, tough: 0, level: "good" });
    expect(s.get("a1")!.regular!.factor).toBeCloseTo(1.6);
    expect(s.get("d1")!.regular).toMatchObject({ games: 1, level: "tough" });
    expect(s.get("d1")!.regular!.factor).toBeCloseTo(0.8);
  });

  it("rates the playoff weeks apart", () => {
    // Weeks 5-6: BBB meets AAA (0.8) and DDD (1.6); DDD meets CCC and BBB (0.8 each).
    expect(s.get("b1")!.playoffs).toMatchObject({ games: 2, good: 1, tough: 1, level: "good" });
    expect(s.get("b1")!.playoffs!.factor).toBeCloseTo(1.2);
    // AAA meets BBB and CCC (0.8 each) too: tied for third.
    expect(s.get("d1")!.playoffs).toMatchObject({ level: "tough", place: 3, of: 4 });
  });

  it("ranks the schedules, easiest first, ties sharing a place", () => {
    expect(s.get("b1")!.playoffs).toMatchObject({ place: 1, of: 4 });
    expect(s.get("c1")!.playoffs).toMatchObject({ place: 1, of: 4 });
  });

  it("counts every week left as regular season when the league has no playoffs set", () => {
    const all = playerSchedules(model, nfl, {}, NO_SHRINK);
    expect(all.get("a1")!.regular).toMatchObject({ games: 3 });
    expect(all.get("a1")!.playoffs).toBeNull();
  });

  it("rates nothing before the season's first games", () => {
    const preseason = playerSchedules(
      model,
      { ...nfl, weeks: [], lineup_week: 1 },
      LEAGUE,
      NO_SHRINK,
    );
    expect(preseason.get("a1")).toMatchObject({ regular: null, playoffs: null, bye: 4 });
  });

  it("gives the bye and whether it was played already", () => {
    expect(s.get("a1")).toMatchObject({ bye: 4, byeDone: false });
    const later = playerSchedules(
      model,
      { ...nfl, weeks: [1, 2, 3, 4], lineup_week: 5 },
      LEAGUE,
      NO_SHRINK,
    );
    expect(later.get("a1")).toMatchObject({ bye: 4, byeDone: true });
  });

  it("gives players without a team nothing", () => {
    expect(s.get("free")).toEqual({ bye: null, byeDone: false, regular: null, playoffs: null });
  });
});

describe("scheduleNote", () => {
  it("says what the number means, its rank and that it is only information", () => {
    const s = playerSchedules(model, nfl, LEAGUE, NO_SHRINK);
    expect(scheduleNote(s.get("b1")!.playoffs!, "RB", "Playoffs")).toBe(
      "Playoffs: opponents allow 20% more points than average to RBs (2 games: 1 good, 1 tough); the easiest of 4. Based on games so far; information only.",
    );
    expect(scheduleNote(s.get("d1")!.playoffs!, "RB", "Playoffs")).toBe(
      "Playoffs: opponents allow 20% fewer points than average to RBs (2 games: 0 good, 2 tough); 3rd easiest of 4. Based on games so far; information only.",
    );
  });
});
