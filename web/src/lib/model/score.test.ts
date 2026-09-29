import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import type { SportConfig } from "../sports/types";
import { bestLineup } from "./lineup";
import { playerScores, SCORE_WEIGHTS, TRADE_VALUE_MAX, usageShares } from "./score";
import {
  evaluateTrade,
  fairnessLevel,
  FINDER_SHAPES,
  findTrades,
  hasEdge,
  ideaProblems,
  isSamePositionSwap,
  type FinderMode,
  type TradeIdea,
  type TradeResult,
  isTrueMatch,
  positionCheck,
  positionNeeds,
  sideValue,
  suggestTrades,
  teamNeeds,
  withFreeAgents,
  benchDepth,
  defaultIdealRoster,
  DEPTH_WEIGHT,
  IDEAL_MAX_PLAYERS,
  idealCounts,
  idealNeeds,
  withIdeal,
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

  it("accepts thinning a position when a good free agent can back it up", () => {
    const out = roster.filter((p) => p.id === "rb1");
    const get = [player("wr4", "WR", 16, 6)];
    const after = roster.filter((p) => p.id !== "rb1").concat(get);
    const fa = player("faRb", "RB", 9, 1);
    const r = positionCheck(roster, after, out, get, needs, "you", (pos) =>
      pos === "RB" ? fa : null,
    );
    // Covered, but a free agent refills less well than a player coming back in the trade.
    expect(r).toMatchObject({ ok: true, covered: true, fit: 0.4, warnings: [] });
    expect(r.backups.map((p) => p.id)).toEqual(["faRb"]);
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

describe("trade finder", () => {
  const slots = ["RB", "WR"];
  const sport: SportConfig = { ...NFL, freeAgentPositions: [] };
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
  const others = [
    player("oRb", "RB", 9, 1),
    player("oRb2", "RB", 8, 0),
    player("oWr", "WR", 15, 6),
    player("oWr2", "WR", 12, 3),
  ];
  const all = Object.fromEntries([...mine, ...theirs, ...others].map((p) => [p.id, p]));
  const model: Model = { players: all, repl: { RB: 8, WR: 9 }, slots, teams: 3 };
  const rosters = [
    { rid: 1, players: mine },
    { rid: 2, players: theirs },
    { rid: 3, players: others },
  ];
  const values = new Map(Object.values(all).map((p) => [p.id, p.value * 2] as const));
  const find = (mode: FinderMode, id: string) =>
    findTrades(mode, id, 1, rosters, model, sport, undefined, values);
  const shape = (r: TradeIdea) => [r.give.length, r.get.length];

  it("sells a chosen player to different teams, always including him", () => {
    const { ideas, closest } = find("sell", "myRb2");
    expect(ideas.length).toBeGreaterThan(1);
    expect(closest).toBeNull();
    for (const r of ideas) expect(r.give.map((p) => p.id)).toContain("myRb2");
    expect(new Set(ideas.map((r) => r.partner)).size).toBeGreaterThan(1);
  });

  it("gets a chosen player from his team, always including him", () => {
    const { ideas } = find("get", "tWr2");
    expect(ideas.length).toBeGreaterThan(0);
    for (const r of ideas) {
      expect(r.partner).toBe(2);
      expect(r.get.map((p) => p.id)).toContain("tWr2");
    }
  });

  it("only tries 1-1, 2-1, 1-2, 2-2, 3-2 and 2-3 deals", () => {
    const allowed = FINDER_SHAPES.map((s) => s.join());
    for (const mode of ["sell", "get"] as const) {
      const id = mode === "sell" ? "myRb2" : "tWr2";
      for (const r of find(mode, id).ideas) expect(allowed).toContain(shape(r).join());
    }
    expect(allowed).not.toContain("3,1");
    expect(allowed).not.toContain("1,3");
  });

  it("shows the closest deal and what it misses when none passes", () => {
    // Their best receiver priced far above anything I could send: no fair package exists.
    const pricey = new Map(values).set("tWr1", 200);
    const { ideas, closest } = findTrades(
      "get",
      "tWr1",
      1,
      rosters,
      model,
      sport,
      undefined,
      pricey,
    );
    expect(ideas).toEqual([]);
    expect(closest).not.toBeNull();
    expect(closest!.get.map((p) => p.id)).toContain("tWr1");
    expect(closest!.problems.join()).toMatch(/more trade value from you would make it fair/);
  });

  it("always shows three trade ideas: passing ones first, near misses with what they miss", () => {
    const ideas = suggestTrades(1, rosters, model, sport, undefined, values);
    expect(ideas).toHaveLength(3);
    const firstNear = ideas.findIndex((r) => r.problems);
    if (firstNear >= 0) {
      for (const r of ideas.slice(firstNear)) expect(r.problems!.length).toBeGreaterThan(0);
    }
    // Among fair ideas that pass, the ones where your starters gain more come first.
    const passing = ideas.filter((r) => !r.problems && fairnessLevel(r.fairness) === "green");
    const edges = passing.map(hasEdge);
    expect(edges).toEqual([...edges].sort((a, b) => Number(b) - Number(a)));
  });

  it("leaves 1-for-1 swaps at the same position out of the trade ideas", () => {
    // Two all-RB teams. A straight RB-for-RB swap would qualify for the list:
    // either passing every rule or, with fewer than three deals, as a near miss
    // (it helps your lineup)…
    const rbs = (prefix: string, values: number[]) =>
      values.map((v, i) => player(`${prefix}Rb${i}`, "RB", v, v - 8));
    const a = rbs("a", [17, 12, 11, 10]);
    const b2 = rbs("b", [16, 13, 10, 9]);
    const all2 = Object.fromEntries([...a, ...b2].map((p) => [p.id, p]));
    const m: Model = { players: all2, repl: { RB: 8, WR: 9 }, slots: ["RB", "RB"], teams: 2 };
    const teams = [
      { rid: 1, players: a },
      { rid: 2, players: b2 },
    ];
    const vals = new Map(Object.values(all2).map((p) => [p.id, p.value * 2] as const));
    const base = (list: Player[]) => bestLineup(list, m.slots, sport).total;
    const swaps = a
      .filter((p) => p.pos === "RB")
      .flatMap((g) => b2.filter((p) => p.pos === "RB").map((t) => [g, t] as const));
    const listable = swaps.filter(([g, t]) => {
      const r = evaluateTrade(a, b2, [g], [t], base(a), base(b2), m, sport, undefined, vals);
      return ideaProblems(r, sport, true).length === 0 || r.gainMe > 0;
    });
    expect(listable.length).toBeGreaterThan(0);

    // …but trade ideas never suggest one.
    const ideas = suggestTrades(1, teams, m, sport, undefined, vals);
    expect(ideas.some((r) => isSamePositionSwap(r.give, r.get))).toBe(false);
  });

  it("returns nothing for a player on the wrong side", () => {
    expect(find("sell", "tWr1")).toEqual({ ideas: [], closest: null });
    expect(find("get", "myRb1")).toEqual({ ideas: [], closest: null });
  });
});

describe("ideal roster", () => {
  it("defaults to 2 QB, 5 RB, 5 WR and 2 TE in a one-flex league, at most 14 players", () => {
    const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "K", "DEF"];
    expect(defaultIdealRoster(slots, NFL)).toEqual({ QB: 2, RB: 5, WR: 5, TE: 2 });
    const threeWide = defaultIdealRoster([...slots, "WR"], NFL);
    expect(Object.values(threeWide).reduce((s, n) => s + n, 0)).toBe(IDEAL_MAX_PLAYERS);
    // Superflex adds a QB; a receiver comes off so the total stays within the limit.
    expect(defaultIdealRoster([...slots, "SUPER_FLEX"], NFL)).toEqual({
      QB: 3,
      RB: 5,
      WR: 4,
      TE: 2,
    });
  });

  const needs = positionNeeds(["QB", "RB", "WR"], NFL);
  const roster = [
    player("qb1", "QB", 20, 3),
    player("rb1", "RB", 15, 7),
    player("rb2", "RB", 12, 4),
    player("rb3", "RB", 10, 2),
    player("wr1", "WR", 14, 5),
    player("wr2", "WR", 11, 2),
  ];
  const check = (give: Player[], get: Player[], ideal: Record<string, number>) => {
    const ids = new Set(give.map((p) => p.id));
    const after = roster.filter((p) => !ids.has(p.id)).concat(get);
    return positionCheck(roster, after, give, get, withIdeal(needs, ideal)).warnings;
  };

  it("warns when a trade takes a position further below the ideal", () => {
    const warnings = check([roster[3]!], [player("wr3", "WR", 12, 3)], { RB: 4 });
    expect(warnings).toEqual(["Leaves you 2 RBs (the ideal roster has 4)"]);
  });

  it("lets a position below the ideal stay as it is", () => {
    expect(check([roster[3]!], [player("rb4", "RB", 11, 3)], { RB: 4 })).toEqual([]);
  });

  it("warns when a trade piles a position above the ideal", () => {
    const warnings = check([roster[5]!], [player("rb4", "RB", 11, 3)], { RB: 3 });
    expect(warnings).toEqual(["You would carry 4 RBs (the ideal roster has 3)"]);
  });

  it("leaves players on injured reserve out of the ideal roster count", () => {
    const hurt = player("rbIr", "RB", 14, 6, { inj: "IR" });
    const withIr = [...roster, hurt];
    // Three healthy RBs and one on IR: getting a fourth healthy RB fits an ideal of 4.
    const get = [player("rb4", "RB", 11, 3)];
    const give = [roster[5]!];
    const after = withIr.filter((p) => p !== give[0]).concat(get);
    expect(positionCheck(withIr, after, give, get, withIdeal(needs, { RB: 4 })).warnings).toEqual(
      [],
    );
    expect(idealCounts(withIr).RB).toBe(3);
    expect(idealNeeds(withIr, { RB: 4 }, { RB: 0.5 })).toEqual({ RB: 0.75 });
  });

  it("wants players where the roster is below the ideal and sells where it is above", () => {
    const needs = idealNeeds(roster, { RB: 2, WR: 4, QB: 1 }, { RB: 0.5, WR: 0.5, QB: 0.5 });
    expect(needs).toEqual({ RB: 0.25, WR: 0.75, QB: 0.5 });
    expect(idealNeeds(roster, { RB: 2 }, undefined)).toBeUndefined();
  });

  it("keeps passing trade ideas and finder deals inside the ideal roster", () => {
    const slots = ["RB", "WR"];
    const sport: SportConfig = { ...NFL, freeAgentPositions: [] };
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
    const values = new Map(Object.values(all).map((p) => [p.id, p.value * 2] as const));
    const rbs = (r: TradeIdea) =>
      3 - r.give.filter((p) => p.pos === "RB").length + r.get.filter((p) => p.pos === "RB").length;

    // Without an ideal, selling a running back for a receiver is the natural deal here.
    const free = suggestTrades(1, rosters, model, sport, undefined, values);
    expect(free.some((r) => !r.problems && rbs(r) < 3)).toBe(true);

    // With three running backs as the ideal, no passing deal leaves fewer.
    const ideal = { RB: 3, WR: 5 };
    const kept = suggestTrades(1, rosters, model, sport, undefined, values, ideal);
    for (const r of kept.filter((r) => !r.problems)) expect(rbs(r)).toBeGreaterThanOrEqual(3);
    const sold = findTrades("sell", "myRb2", 1, rosters, model, sport, undefined, values, ideal);
    for (const r of sold.ideas) expect(rbs(r)).toBeGreaterThanOrEqual(3);
  });
});

describe("idea problems", () => {
  const base = {
    dMe: 1,
    dThem: 1,
    gainMe: 1,
    gainThem: 1,
    fairness: 1,
    sGive: 20,
    sGet: 20,
    warnings: [] as string[],
    theirWarnings: [] as string[],
    positionsOk: true,
    positionFit: 1,
    positionsCovered: true,
  } as unknown as TradeResult;

  it("passes a clean deal", () => {
    expect(ideaProblems(base, NFL, true)).toEqual([]);
  });

  it("asks for a real gain for both teams", () => {
    const flat = { ...base, gainMe: 0, gainThem: 0 };
    expect(ideaProblems(flat, NFL, true)).toEqual([
      "Does not improve your team enough",
      "Does not improve their team, so they may say no",
    ]);
  });

  it("says how much value is missing, and names roster problems", () => {
    const r = {
      ...base,
      sGive: 10,
      sGet: 20,
      fairness: 0.5,
      theirWarnings: ["They would carry 3 QBs (2 is plenty)"],
    };
    const problems = ideaProblems(r, NFL, true);
    expect(problems[0]).toMatch(/About 7\.0 more trade value from you/);
    expect(problems).toContain("They would carry 3 QBs (2 is plenty)");
    const losing = ideaProblems({ ...base, sGive: 20, sGet: 10, fairness: 0.5 }, NFL, true);
    expect(losing[0]).toMatch(/send about 10\.0 more trade value/);
  });
});

describe("refilling a valuable player's position", () => {
  const slots = ["RB", "RB", "WR", "WR", "FLEX"];
  const sport: SportConfig = { ...NFL, freeAgentPositions: ["RB", "WR"] };
  // I have exactly three running backs and weak receivers; they have running backs to spare.
  const mine = [
    player("kyren", "RB", 16, 8),
    player("myRb2", "RB", 13, 5),
    player("myRb3", "RB", 11, 3),
    player("myWr1", "WR", 10, 1),
    player("myWr2", "WR", 9, 0),
    player("myWr3", "WR", 8, 0),
  ];
  const theirs = [
    player("wrStar", "WR", 17, 8),
    player("tWr2", "WR", 13, 4),
    player("tWr3", "WR", 9, 0),
    player("etienne", "RB", 12, 4),
    player("jones", "RB", 11, 3),
    player("pollard", "RB", 10, 2),
  ];
  const faRb = player("faRb", "RB", 8, 0);
  const all = Object.fromEntries([...mine, ...theirs, faRb].map((p) => [p.id, p]));
  const model: Model = { players: all, repl: { RB: 8, WR: 9 }, slots, teams: 2 };
  const pool = new Map([["RB", [faRb]]]);
  const values = new Map(Object.values(all).map((p) => [p.id, p.value] as const));
  const base = (list: Player[]) => bestLineup(list, model.slots, sport).total;
  const trade = (get: Player[]) =>
    evaluateTrade(
      mine,
      theirs,
      [all.kyren!],
      get,
      base(mine),
      base(theirs),
      model,
      sport,
      pool,
      values,
    );

  it("counts the backup running back you get back as depth", () => {
    // A backup running back 3 points above a free agent adds 20% of those 3 points.
    const withBackup = [...mine, player("spareRb", "RB", 11, 3)];
    expect(benchDepth(withBackup, model, sport) - benchDepth(mine, model, sport)).toBeCloseTo(
      DEPTH_WEIGHT * 3,
    );
    const r = trade([all.tWr2!, all.pollard!]);
    expect(r.gainMe).toBeCloseTo(r.dMe + r.depthMe);
    // Without trade values (the prototype), depth does not count.
    const legacy = evaluateTrade(mine, theirs, [all.kyren!], [all.wrStar!], 0, 0, model, sport);
    expect(legacy.depthMe).toBe(0);
    expect(legacy.gainMe).toBe(legacy.dMe);
  });

  it("prefers getting one of their spare running backs back over a free agent", () => {
    const direct = trade([all.wrStar!]);
    const withRb = trade([all.tWr2!, all.pollard!]);
    expect(direct.positionsCovered).toBe(true); // a free agent can back up
    expect(direct.myBackups.map((p) => p.id)).toEqual(["faRb"]);
    expect(direct.positionFit).toBeCloseTo(0.4);
    expect(withRb.positionFit).toBe(1);
    expect(withRb.myBackups).toEqual([]);
  });
});

describe("free agent for an open roster spot", () => {
  it("never adds a third QB and fills the thinnest position on a tie", () => {
    const slots = ["QB", "RB", "RB", "WR", "WR", "FLEX"];
    const roster = [
      player("qb1", "QB", 20, 3),
      player("qb2", "QB", 16, 0),
      player("rb1", "RB", 15, 7),
      player("rb2", "RB", 14, 6),
      player("wr1", "WR", 14, 5),
      player("wr2", "WR", 13, 4),
      player("wr3", "WR", 12, 3),
    ];
    const model: Model = {
      players: Object.fromEntries(roster.map((p) => [p.id, p])),
      repl: { QB: 17, RB: 5, WR: 6, TE: 4 },
      slots,
      teams: 2,
    };
    // No free agent improves the lineup, so the pick is about depth.
    const { added } = withFreeAgents(roster, 1, model, NFL, undefined, new Set(), true);
    expect(added[0]!.pos).toBe("RB");
  });
});
