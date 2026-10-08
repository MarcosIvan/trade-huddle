import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { playerCard, seasonRanks, statLevel } from "./playerCard";
import type { Model, Player, StatsFile } from "./types";

const keys = ["rush_att", "rush_yd", "rush_td", "rec", "rec_yd", "pass_yd", "fum"];

function player(weekly: { week: number; pts: number | null }[], extra: Partial<Player> = {}) {
  return {
    id: "rb",
    name: "Runner",
    pos: "RB",
    elig: ["RB"],
    value: 12,
    vorp: 3,
    startable: true,
    team: "AAA",
    noTeam: false,
    weekly,
    ...extra,
  } as Player;
}

// Weeks 1-2 played; week 3 is under way (AAA plays later); week 4 is AAA's bye; week 5 left.
const stats: StatsFile = {
  generated_at: "2026-10-02T00:00:00Z",
  season: "2026",
  prev_season: "2025",
  weeks: [1, 2, 3],
  keys,
  lineup_week: 3,
  schedule: {
    "1": [["AAA", "BBB"]],
    "2": [["CCC", "AAA"]],
    "3": [["DDD", "AAA"]],
    "4": [["BBB", "CCC"]],
    "5": [["AAA", "CCC"]],
  },
  players: {
    rb: {
      n: "Runner",
      p: "RB",
      t: "AAA",
      w: {
        "1": [0, 15, 1, 80, 2, 1, 3, 2, 4, 20, 5, 0, 6, 1],
        "2": [0, 10, 1, 40, 3, 4, 4, 35],
      },
      tw: { "1": "AAA", "2": "AAA" },
    },
  },
};

// BBB allows 20% more to running backs, CCC 20% fewer, DDD about the average.
const factors = new Map([
  ["BBB", new Map([["RB", 1.2]])],
  ["CCC", new Map([["RB", 0.8]])],
  ["DDD", new Map([["RB", 1.03]])],
]);

describe("player card", () => {
  const p = player([
    { week: 1, pts: 18.5 },
    { week: 2, pts: 11 },
    { week: 3, pts: null },
  ]);
  const card = playerCard(p, stats, factors, NFL);

  it("lists each game played with its opponent, points and stat line", () => {
    expect(card.games.map((g) => [g.week, g.opponent, g.home, g.pts])).toEqual([
      [1, "BBB", false, 18.5],
      [2, "CCC", true, 11],
    ]);
    // Only the position's game log columns: no passing yards or fumbles for a running back.
    expect(card.games[0]!.stats).toEqual({
      rush_att: 15,
      rush_yd: 80,
      rush_td: 1,
      rec: 2,
      rec_yd: 20,
    });
    expect(card.totals).toEqual({ rush_att: 25, rush_yd: 120, rush_td: 1, rec: 6, rec_yd: 55 });
    expect([card.pts, card.played]).toEqual([29.5, 2]);
  });

  it("rates every game, played or to come, by what the defense allows to the position", () => {
    expect(card.games.map((g) => g.level)).toEqual(["good", "tough"]);
    expect(card.upcoming.map((g) => [g.week, g.opponent, g.bye, g.level])).toEqual([
      [3, "DDD", false, "neutral"],
      [4, null, true, null],
      [5, "CCC", false, "tough"],
    ]);
  });

  it("keeps a game already played in the week under way out of the games to come", () => {
    const early = playerCard(
      player([
        { week: 1, pts: 18.5 },
        { week: 2, pts: 11 },
        { week: 3, pts: 9 },
      ]),
      stats,
      factors,
      NFL,
    );
    expect(early.games.map((g) => g.week)).toEqual([1, 2, 3]);
    expect(early.upcoming.map((g) => g.week)).toEqual([4, 5]);
  });

  it("has no games to come without a schedule or a team", () => {
    expect(playerCard(p, { ...stats, schedule: undefined }, factors, NFL).upcoming).toEqual([]);
    expect(playerCard({ ...p, noTeam: true, team: "" }, stats, factors, NFL).upcoming).toEqual([]);
  });
});

describe("stat colors", () => {
  it("calls a number good or bad from 15% off the starters' average", () => {
    expect([115, 114, 86, 85].map((v) => statLevel(v, 100))).toEqual([
      "good",
      "neutral",
      "neutral",
      "bad",
    ]);
  });

  it("keeps a zero neutral for rare stats like touchdowns", () => {
    expect(statLevel(0, 0.6)).toBe("neutral");
    expect(statLevel(1, 0.6)).toBe("good");
    expect(statLevel(0, 3)).toBe("bad");
    // A receiver's rushing: no carries is no failure.
    expect(statLevel(0, 1.1, false, true)).toBe("neutral");
  });

  it("turns the scale around where fewer is better", () => {
    expect(statLevel(0, 0.7, true)).toBe("good");
    expect(statLevel(2, 0.7, true)).toBe("bad");
    expect(statLevel(0.7, 0.7, true)).toBe("neutral");
  });
});

describe("seasonRanks", () => {
  const p = (id: string, pos: string, pts: (number | null)[]) =>
    ({
      id,
      pos,
      g: pts.filter((x) => x !== null).length,
      weekly: pts.map((x, i) => ({ week: i + 1, pts: x })),
    }) as Player;
  const model = {
    players: Object.fromEntries(
      [
        p("qb1", "QB", [20, 25]),
        p("rb1", "RB", [30, 10]),
        p("rb2", "RB", [15, null]),
        p("wr1", "WR", [15, 0]),
        p("rb3", "RB", [5, 10]),
        p("out", "WR", [null, null]),
      ].map((x) => [x.id, x]),
    ),
  } as unknown as Model;
  const ranks = seasonRanks(model);

  it("ranks by season points at the position and overall", () => {
    expect(ranks.get("qb1")).toEqual({ pos: 1, overall: 1 });
    expect(ranks.get("rb1")).toEqual({ pos: 1, overall: 2 });
    expect(ranks.get("wr1")).toEqual({ pos: 1, overall: 3 });
  });

  it("gives tied players the same rank", () => {
    expect(ranks.get("rb2")).toEqual({ pos: 2, overall: 3 });
    expect(ranks.get("rb3")).toEqual({ pos: 2, overall: 3 });
  });

  it("leaves out players who have not played", () => {
    expect(ranks.has("out")).toBe(false);
  });
});
