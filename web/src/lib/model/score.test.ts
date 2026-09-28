import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { playerScores, usageShares } from "./score";
import { evaluateTrade, fairnessLevel, isTrueMatch, suggestTrades } from "./trades";
import type { Model, Player, StatsFile } from "./types";

function player(
  id: string,
  pos: string,
  value: number,
  vorp: number,
  extra: Partial<Player> = {},
): Player {
  return {
    id,
    name: id,
    pos,
    elig: [pos],
    value,
    vorp,
    startable: true,
    team: "AAA",
    noTeam: false,
    age: undefined,
    inj: null,
    status: null,
    weekly: [],
    g: 3,
    seasonAvg: value,
    lastAvg: value,
    prevG: 16,
    prevPpg: value,
    projPpg: null,
    injMult: 1,
    weights: { prev: 0, season: 0, recent: 0, repl: 0 },
    context: null,
    ...extra,
  };
}

const emptyStats: StatsFile = {
  generated_at: "",
  season: "2026",
  prev_season: "2025",
  weeks: [],
  keys: [],
  players: {},
};

describe("playerScores", () => {
  const players = {
    star: player("star", "RB", 22, 14),
    mid: player("mid", "RB", 15, 7),
    rep: player("rep", "RB", 8, 0),
  };
  const model: Model = { players, repl: { RB: 8 }, slots: ["RB"], teams: 2 };
  const scores = playerScores(model, emptyStats, [{ playerIds: ["star", "mid"] }]);

  it("stays between 0 and 100 and gives the league's best the full level", () => {
    for (const s of scores.values()) {
      expect(s.total).toBeGreaterThanOrEqual(0);
      expect(s.total).toBeLessThanOrEqual(100);
    }
    expect(scores.get("star")!.level).toBe(1);
    expect(scores.get("rep")!.level).toBe(0);
  });

  it("adds team importance to the total but not to the trade score", () => {
    const star = scores.get("star")!;
    expect(star.importance).toBe(1);
    expect(star.total - star.trade).toBeCloseTo(20);
    expect(scores.get("rep")!.importance).toBe(0); // not on a roster
  });
});

describe("usage bonus", () => {
  // One offense: 30 targets + 30 carries per game. The RB takes 21, WR1 8, WR2 5, WR3 4, WR4 1.
  const keys = ["rec_tgt", "rush_att"];
  const game = (tgt: number, att: number) => ({ "1": [0, tgt, 1, att] });
  const stats: StatsFile = {
    ...emptyStats,
    weeks: [1],
    keys,
    team_weeks: { AAA: { "1": [30, 30, 0] } },
    players: Object.fromEntries(
      [
        ["rb", 3, 18],
        ["wr1", 8, 0],
        ["wr2", 5, 0],
        ["wr3", 4, 0],
        ["wr4", 1, 0],
      ].map(([id, tgt, att]) => [
        id,
        { n: String(id), t: "AAA", w: game(Number(tgt), Number(att)), tw: { "1": "AAA" } },
      ]),
    ),
  };
  const model: Model = {
    players: {
      rb: player("rb", "RB", 15, 5),
      wr1: player("wr1", "WR", 14, 5),
      wr2: player("wr2", "WR", 12, 3),
      wr3: player("wr3", "WR", 10, 1),
      wr4: player("wr4", "WR", 6, 0),
    },
    repl: { RB: 10, WR: 9 },
    slots: [],
    teams: 1,
  };

  it("measures each player's share of the team's targets and carries", () => {
    expect(usageShares(model, stats).get("wr1")).toBeCloseTo(8 / 60);
  });

  it("rewards the top three weapons, the first the most", () => {
    const scores = playerScores(model, stats, []);
    const rank = (id: string) => scores.get(id)!.usageRank;
    expect([rank("rb"), rank("wr1"), rank("wr2"), rank("wr4")]).toEqual([1, 2, 3, null]);
    expect(scores.get("rb")!.usage).toBeGreaterThan(scores.get("wr1")!.usage);
    expect(scores.get("wr1")!.usage).toBeGreaterThan(scores.get("wr2")!.usage);
    expect(scores.get("wr4")!.usage).toBe(0);
  });
});

describe("fairness and match", () => {
  const sport: SportConfig = { ...NFL, freeAgentPositions: ["WR"] };
  const slots = ["WR", "WR", "FLEX"];
  // Me: two good receivers and a bench one. Them: one star receiver, thin behind him.
  const players = {
    myWr1: player("myWr1", "WR", 16, 7),
    myWr2: player("myWr2", "WR", 14, 5),
    myWr3: player("myWr3", "WR", 12, 3),
    myRb: player("myRb", "RB", 13, 5),
    star: player("star", "WR", 20, 11),
    theirWr: player("theirWr", "WR", 5, 0), // thin at receiver behind the star
    theirRb: player("theirRb", "RB", 12, 4),
    theirRb2: player("theirRb2", "RB", 11, 3),
  };
  const model: Model = { players, repl: { WR: 9, RB: 8 }, slots, teams: 2 };
  const scores = new Map(Object.values(players).map((p) => [p.id, p.vorp * 5] as const));
  const mine = [players.myWr1, players.myWr2, players.myWr3, players.myRb];
  const theirs = [players.star, players.theirWr, players.theirRb, players.theirRb2];

  it("uses trade scores for fairness and the traffic light", () => {
    const r = evaluateTrade(
      mine,
      theirs,
      [players.myWr2],
      [players.star],
      43,
      43,
      model,
      sport,
      undefined,
      scores,
    );
    expect(r.fairness).toBeCloseTo(25 / 55);
    expect(fairnessLevel(r.fairness)).toBe("red");
    expect(fairnessLevel(0.92)).toBe("green");
    expect(fairnessLevel(0.8)).toBe("yellow");
  });

  it("rates two receivers (a starter and a bench one) for one better as a match", () => {
    const give = [players.myWr1, players.myWr3];
    const base = (list: Player[]) => bestLineup(list, model.slots, sport).total;
    const r = evaluateTrade(
      mine,
      theirs,
      give,
      [players.star],
      base(mine),
      base(theirs),
      model,
      sport,
      undefined,
      scores,
    );
    expect(r.dMe).toBeGreaterThan(0);
    expect(r.dThem).toBeGreaterThan(0); // they needed receiver depth
    expect(r.benchShare).toBeGreaterThan(0); // the third receiver sat on my bench
    expect(fairnessLevel(r.fairness)).toBe("green");
    expect(isTrueMatch(r)).toBe(true);
  });

  it("puts fair trades first among suggestions", () => {
    const ideas = suggestTrades(
      1,
      [
        { rid: 1, players: mine },
        { rid: 2, players: theirs },
      ],
      model,
      sport,
      undefined,
      scores,
    );
    expect(ideas.length).toBeGreaterThan(0);
    for (const r of ideas) expect(fairnessLevel(r.fairness)).not.toBe("red");
    expect(fairnessLevel(ideas[0]!.fairness)).toBe("green");
  });
});
