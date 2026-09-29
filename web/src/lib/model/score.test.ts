import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { playerScores, SCORE_WEIGHTS, TRADE_VALUE_MAX, usageShares } from "./score";
import {
  evaluateTrade,
  fairnessLevel,
  isTrueMatch,
  positionCheck,
  positionNeeds,
  sideValue,
  suggestTrades,
  teamNeeds,
} from "./trades";
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
    scrub: player("scrub", "RB", 1, 0),
  };
  const model: Model = { players, repl: { RB: 8 }, slots: ["RB"], teams: 2 };
  const scores = playerScores(model, emptyStats, [{ playerIds: ["star", "mid"] }], NFL);

  it("gives every player a trade value between 1 and 40 (one decimal), the league's best 40", () => {
    for (const s of scores.values()) {
      expect(s.trade).toBeGreaterThanOrEqual(1);
      expect(s.trade).toBeLessThanOrEqual(TRADE_VALUE_MAX);
      expect(Math.round(s.trade * 10) / 10).toBe(s.trade);
      expect(s.total).toBeLessThanOrEqual(100);
    }
    expect(scores.get("star")!.trade).toBe(TRADE_VALUE_MAX);
    // At replacement level or below, a player is still worth something.
    expect(scores.get("rep")!.trade).toBeGreaterThan(scores.get("scrub")!.trade);
  });

  it("orders players by what they produce", () => {
    const t = (id: string) => scores.get(id)!.trade;
    expect(t("star")).toBeGreaterThan(t("mid"));
    expect(t("mid")).toBeGreaterThan(t("rep"));
  });

  it("adds team importance to the Player Score but not to the trade value", () => {
    const star = scores.get("star")!;
    expect(star.importance).toBe(1);
    expect(star.total).toBeCloseTo(SCORE_WEIGHTS.trade + SCORE_WEIGHTS.importance);
    expect(scores.get("rep")!.importance).toBe(0); // not on a roster
  });
});

describe("trade value", () => {
  const league = (extra: Record<string, Player>) => {
    const base = {
      rbTop: player("rbTop", "RB", 20, 12),
      wrTop: player("wrTop", "WR", 20, 8),
      ...extra,
    };
    const model: Model = {
      players: base,
      repl: { RB: 8, WR: 12 },
      slots: ["RB", "WR", "FLEX"],
      teams: 1,
    };
    return playerScores(model, emptyStats, [], NFL);
  };

  it("values the scarcer position more for the same production", () => {
    const s = league({});
    expect(s.get("rbTop")!.trade).toBeGreaterThan(s.get("wrTop")!.trade);
  });

  it("counts three hot games once early in the season, leaning on the proven base", () => {
    // Same expected points; one proven (strong base), one hot for 3 games.
    const proven = player("proven", "WR", 14, 2, { prevPpg: 15, seasonAvg: 10, lastAvg: 10 });
    const hot = player("hot", "WR", 14, 2, { prevPpg: 9, seasonAvg: 19, lastAvg: 19 });
    const early = league({ proven, hot });
    expect(early.get("proven")!.trade).toBeGreaterThan(early.get("hot")!.trade);
    // Later in the season the recent games have their own weight and the hot player catches up.
    const late = league({
      proven: { ...proven, g: 10 },
      hot: { ...hot, g: 10 },
    });
    const gap = (m: Map<string, { trade: number }>) => m.get("proven")!.trade - m.get("hot")!.trade;
    expect(gap(late)).toBeLessThan(gap(early));
  });

  it("keeps part of an injured player's value, and little for a player without a team", () => {
    const healthy = player("healthy", "WR", 16, 4);
    const onIr = player("onIr", "WR", 8, 0, { inj: "IR", injMult: 0.5 });
    const noTeam = player("noTeam", "WR", 4, 0, { noTeam: true, team: "", injMult: 0.25 });
    const s = league({ healthy, onIr, noTeam });
    const t = (id: string) => s.get(id)!.trade;
    expect(t("onIr")).toBeGreaterThan(0.5 * t("healthy"));
    expect(t("onIr")).toBeLessThan(t("healthy"));
    expect(t("noTeam")).toBeLessThan(0.3 * t("healthy"));
    expect(t("noTeam")).toBeGreaterThanOrEqual(1);
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

  it("ranks the top three weapons and scores usage relative to a lead player", () => {
    const scores = playerScores(model, stats, [], NFL);
    const rank = (id: string) => scores.get(id)!.usageRank;
    const usage = (id: string) => scores.get(id)!.parts.usage;
    expect([rank("rb"), rank("wr1"), rank("wr2"), rank("wr4")]).toEqual([1, 2, 3, null]);
    expect(usage("rb")).toBe(1);
    expect(usage("wr1")).toBeGreaterThan(usage("wr2"));
    expect(usage("wr2")).toBeGreaterThan(usage("wr4"));
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
    star: player("star", "WR", 20, 10),
    theirWr: player("theirWr", "WR", 5, 0), // thin at receiver behind the star
    theirRb: player("theirRb", "RB", 12, 4),
    theirRb2: player("theirRb2", "RB", 11, 3),
  };
  const model: Model = { players, repl: { WR: 9, RB: 8 }, slots, teams: 2 };
  const scores = new Map(Object.values(players).map((p) => [p.id, p.vorp * 5] as const));
  const mine = [players.myWr1, players.myWr2, players.myWr3, players.myRb];
  const theirs = [players.star, players.theirWr, players.theirRb, players.theirRb2];

  it("uses trade values for fairness and the traffic light", () => {
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
    expect(r.fairness).toBeCloseTo(25 / 50);
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

describe("side value", () => {
  it("counts the best player in full and the next ones less", () => {
    expect(sideValue([50])).toBe(50);
    expect(sideValue([20, 40])).toBeCloseTo(40 + 0.85 * 20);
    expect(sideValue([10, 30, 20])).toBeCloseTo(30 + 0.85 * 20 + 0.7 * 10);
  });

  it("keeps two good players from adding up to a star", () => {
    expect(sideValue([45, 45]) / 100).toBeLessThan(0.9);
  });
});

describe("position balance", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"];
  const needs = positionNeeds(slots, NFL);

  it("needs the starters plus a flex backup, and caps spare QBs and TEs", () => {
    expect(needs.min).toMatchObject({ QB: 1, RB: 3, WR: 3, TE: 1 });
    expect(needs.cap).toMatchObject({ QB: 2, TE: 2 });
    expect(needs.cap.RB).toBe(Infinity);
    expect(positionNeeds(["QB", "SUPER_FLEX", "RB"], NFL).min.QB).toBe(2);
  });

  const roster = [
    player("qb1", "QB", 20, 3),
    player("qb2", "QB", 16, 0),
    player("rb1", "RB", 15, 7),
    player("rb2", "RB", 12, 4),
    player("rb3", "RB", 9, 1),
    player("wr1", "WR", 14, 5),
    player("wr2", "WR", 12, 3),
    player("wr3", "WR", 10, 1),
    player("te1", "TE", 10, 2),
  ];
  const trade = (give: string[], get: Player[]) => {
    const out = roster.filter((p) => give.includes(p.id));
    const after = roster.filter((p) => !give.includes(p.id)).concat(get);
    return positionCheck(roster, after, out, get, needs);
  };

  it("flags a third QB", () => {
    const r = trade(["rb3"], [player("qb3", "QB", 18, 1)]);
    expect(r.ok).toBe(false);
    expect(r.warnings.join()).toMatch(/3 QBs/);
  });

  it("flags a trade that leaves the lineup short at a position", () => {
    const r = trade(["rb1"], [player("wr4", "WR", 16, 6)]);
    expect(r.ok).toBe(false);
    expect(r.warnings.join()).toMatch(/2 healthy RBs/);
    expect(r.fit).toBe(0); // the running back was not replaced
  });

  it("accepts a swap at the same position", () => {
    const r = trade(["rb2"], [player("rb4", "RB", 13, 5)]);
    expect(r).toMatchObject({ ok: true, fit: 1, warnings: [] });
  });
});

describe("trade ideas put value first and keep positions sound", () => {
  const slots = ["QB", "RB", "WR", "FLEX"];
  const sport: SportConfig = { ...NFL, freeAgentPositions: [] };
  // I have running backs to spare and weak receivers; they are thin at running back.
  const mine = [
    player("myQb", "QB", 18, 2),
    player("myQb2", "QB", 15, 0),
    player("myRb", "RB", 14, 6),
    player("myRb2", "RB", 11, 3),
    player("myRb3", "RB", 9, 1),
    player("myRb4", "RB", 8, 0),
    player("myWr", "WR", 11, 2),
    player("myWr2", "WR", 10, 1),
  ];
  const theirs = [
    player("tQb", "QB", 24, 8), // a better QB: tempting, but I already have two
    player("tRb2", "RB", 8, 0),
    player("tWr", "WR", 16, 6),
    player("tWr2", "WR", 12, 3),
    player("tHot", "WR", 13, 4), // scoring more lately, but worth less in trade
  ];
  const all = Object.fromEntries([...mine, ...theirs].map((p) => [p.id, p]));
  const model: Model = { players: all, repl: { QB: 16, RB: 8, WR: 9 }, slots, teams: 2 };
  const values = new Map<string, number>([
    ["myQb", 40],
    ["myQb2", 25],
    ["myRb", 60],
    ["myRb2", 35],
    ["myRb3", 20],
    ["myRb4", 12],
    ["myWr", 30],
    ["myWr2", 22],
    ["tQb", 55],
    ["tRb2", 15],
    ["tWr", 58],
    ["tWr2", 36],
    ["tHot", 44],
  ]);
  const ideas = suggestTrades(
    1,
    [
      { rid: 1, players: mine },
      { rid: 2, players: theirs },
    ],
    model,
    sport,
    undefined,
    values,
  );

  it("never costs me more than 10% of the value I send", () => {
    expect(ideas.length).toBeGreaterThan(0);
    for (const r of ideas) {
      expect(r.sGet).toBeGreaterThanOrEqual(0.9 * r.sGive);
      expect(r.fairness).toBeGreaterThanOrEqual(0.85);
    }
  });

  it("never brings in a third QB and always refills what I send", () => {
    for (const r of ideas) {
      expect(r.positionsOk && r.theirPositionsOk).toBe(true);
      expect(r.positionFit).toBe(1);
      expect(r.get.some((p) => p.id === "tQb") && !r.give.some((p) => p.pos === "QB")).toBe(false);
    }
  });

  it("finds the fair swap of a spare runner for a receiver", () => {
    const ids = (list: Player[]) => list.map((p) => p.id);
    expect(ideas.map((r) => [ids(r.give), ids(r.get)])).toContainEqual([["myRb2"], ["tWr2"]]);
  });

  it("does not trade my higher-value runner for a lower-value hot receiver", () => {
    const bad = ideas.find(
      (r) => r.give.some((p) => p.id === "myRb") && r.get.every((p) => p.id === "tHot"),
    );
    expect(bad).toBeUndefined();
  });
});

describe("trade ideas that fit both sides' needs", () => {
  const slots = ["RB", "WR"];
  const sport: SportConfig = { ...NFL, freeAgentPositions: [] };
  // I am deep at running back and weak at receiver; they are the opposite.
  const mine = [
    player("myRb1", "RB", 16, 8),
    player("myRb2", "RB", 15, 7),
    player("myRb3", "RB", 10, 2),
    player("myWr1", "WR", 9, 0),
    player("myWr2", "WR", 8, 0),
  ];
  const theirs = [
    player("tRb1", "RB", 9, 1),
    player("tRb2", "RB", 8, 0),
    player("tWr1", "WR", 17, 8),
    player("tWr2", "WR", 15, 6),
    player("tWr3", "WR", 10, 1),
  ];
  const all = Object.fromEntries([...mine, ...theirs].map((p) => [p.id, p]));
  const model: Model = { players: all, repl: { RB: 8, WR: 9 }, slots, teams: 2 };
  const rosters = [
    { rid: 1, players: mine },
    { rid: 2, players: theirs },
  ];

  it("ranks each team's positions from strong (0) to weak (1)", () => {
    const needs = teamNeeds(rosters, model, sport);
    expect(needs.get(1)).toMatchObject({ RB: 0, WR: 1 });
    expect(needs.get(2)).toMatchObject({ RB: 1, WR: 0 });
  });

  it("scores a swap where each side gets the best player at its weak position", () => {
    const values = new Map(Object.values(all).map((p) => [p.id, p.value * 3] as const));
    const needs = teamNeeds(rosters, model, sport);
    const base = (list: Player[]) => bestLineup(list, model.slots, sport).total;
    const r = evaluateTrade(
      mine,
      theirs,
      [all.myRb2!],
      [all.tWr2!],
      base(mine),
      base(theirs),
      model,
      sport,
      undefined,
      values,
      { mine: needs.get(1), theirs: needs.get(2) },
    );
    expect(r.myNeedFit).toBe(1);
    expect(r.theirNeedFit).toBe(1);
    expect(r.myNeedPos).toBe("WR");
    expect(r.theirNeedPos).toBe("RB");
  });
});
