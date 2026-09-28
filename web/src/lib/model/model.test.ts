import { describe, expect, it } from "vitest";
import { NFL as NFL_LIVE, NFL_PROTOTYPE as NFL } from "../sports/nfl";
import type { SportConfig } from "../sports/types";
import { buildModel, modelSlots } from "./build";
import { bestLineup } from "./lineup";
import { replacementLevels } from "./replacement";
import { average, makeScorer } from "./scoring";
import { combos, evaluateTrade, pickDiverse, suggestTrades, type TradeIdea } from "./trades";
import type { Model, Player } from "./types";
import { estimate, type ValueInputs } from "./value";
import { verdict } from "./verdict";

const P = NFL.model;

function player(id: string, pos: string, value: number, extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    pos,
    elig: [pos],
    value,
    vorp: 0,
    startable: true,
    team: "",
    noTeam: false,
    age: undefined,
    inj: null,
    status: null,
    weekly: [],
    g: 0,
    seasonAvg: null,
    lastAvg: null,
    prevG: 0,
    prevPpg: null,
    injMult: 1,
    weights: { prev: 0, season: 0, recent: 0, repl: 0 },
    ...extra,
  };
}

const inputs = (extra: Partial<ValueInputs>): ValueInputs => ({
  pos: "WR",
  g: 0,
  seasonAvg: null,
  lastAvg: null,
  prevG: 0,
  prevPpg: null,
  inj: null,
  ...extra,
});

describe("makeScorer", () => {
  const score = makeScorer(["rec", "rec_yd", "pts_allow_14_20", "unused"], {
    rec: 0.5,
    rec_yd: 0.1,
    pts_allow_14_20: 1,
  });

  it("multiplies each stat by the league weight and sums", () => {
    expect(score([0, 6, 1, 85])).toBeCloseTo(3 + 8.5);
  });

  it("treats brackets as linear stats and ignores unscored keys", () => {
    expect(score([2, 1, 3, 999])).toBe(1);
  });

  it("returns 0 for missing stats", () => {
    expect(score(undefined)).toBe(0);
    expect(makeScorer(["rec"], undefined)([0, 5])).toBe(0);
  });

  it("averages, with null for no games", () => {
    expect(average([10, 20])).toBe(15);
    expect(average([])).toBeNull();
  });
});

describe("estimate", () => {
  const repl = { WR: 8, RB: 9 };

  it("uses last season's ppg when no games were played this season", () => {
    const e = estimate(inputs({ prevG: 16, prevPpg: 14 }), repl, P);
    expect(e.value).toBe(14);
    expect(e.weights).toEqual({ prev: 1, season: 0, recent: 0, repl: 0 });
  });

  it("blends last season, this season and the last games after games are played", () => {
    // After 3 games: last season 0.60 - 0.24 = 0.36; the rest 0.64 splits 45/55.
    const e = estimate(
      inputs({ g: 3, seasonAvg: 12, lastAvg: 12, prevG: 16, prevPpg: 10 }),
      repl,
      P,
    );
    expect(e.weights.prev).toBeCloseTo(0.36);
    expect(e.weights.season).toBeCloseTo(0.64 * 0.45);
    expect(e.weights.recent).toBeCloseTo(0.64 * 0.55);
    expect(e.value).toBeCloseTo(0.36 * 10 + 0.64 * 12);
  });

  it("never drops last season below the floor", () => {
    const e = estimate(
      inputs({ g: 12, seasonAvg: 10, lastAvg: 10, prevG: 16, prevPpg: 10 }),
      repl,
      P,
    );
    expect(e.weights.prev).toBeCloseTo(P.wPrevMin);
  });

  it("scales last season down when the player barely played it", () => {
    const full = estimate(
      inputs({ g: 1, seasonAvg: 10, lastAvg: 10, prevG: 16, prevPpg: 10 }),
      null,
      P,
    );
    const half = estimate(
      inputs({ g: 1, seasonAvg: 10, lastAvg: 10, prevG: 2, prevPpg: 10 }),
      null,
      P,
    );
    expect(half.weights.prev).toBeCloseTo(full.weights.prev / 2);
  });

  it("pulls a rookie toward replacement level, less with every game", () => {
    const one = estimate(inputs({ g: 1, seasonAvg: 20, lastAvg: 20 }), repl, P);
    const three = estimate(inputs({ g: 3, seasonAvg: 20, lastAvg: 20 }), repl, P);
    expect(one.weights.repl).toBeCloseTo(1 / 2);
    expect(one.value).toBeCloseTo(0.5 * 20 + 0.5 * 8);
    expect(three.weights.repl).toBeCloseTo(1 / 4);
    expect(three.value).toBeGreaterThan(one.value);
  });

  it("values a player with no games and no history at replacement level", () => {
    const e = estimate(inputs({ pos: "RB" }), repl, P);
    expect(e.value).toBe(9);
    expect(e.weights.repl).toBe(1);
    expect(estimate(inputs({ pos: "RB" }), null, P).value).toBe(0);
  });

  it("applies injury multipliers and benches players who cannot play", () => {
    const base = inputs({ prevG: 16, prevPpg: 10 });
    expect(estimate({ ...base, inj: "IR" }, repl, P)).toMatchObject({ value: 5, startable: false });
    expect(estimate({ ...base, inj: "Out" }, repl, P)).toMatchObject({ value: 9, startable: true });
    expect(estimate({ ...base, inj: "Doubtful" }, repl, P).value).toBeCloseTo(9.5);
    expect(estimate({ ...base, inj: "Questionable" }, repl, P).value).toBe(10);
  });

  it("never goes below zero", () => {
    expect(estimate(inputs({ prevG: 16, prevPpg: -2 }), repl, P).value).toBe(0);
  });
});

describe("bestLineup", () => {
  const slots = ["QB", "RB", "WR", "TE", "FLEX", "SUPER_FLEX"];

  it("fills fixed slots first, then flex from narrowest to widest", () => {
    const roster = [
      player("qb1", "QB", 20),
      player("qb2", "QB", 15),
      player("rb1", "RB", 12),
      player("rb2", "RB", 11),
      player("wr1", "WR", 10),
      player("te1", "TE", 6),
    ];
    const lu = bestLineup(roster, slots, NFL);
    expect(lu.slots.map((p) => p?.id ?? null)).toEqual(["qb1", "rb1", "wr1", "te1", "rb2", "qb2"]);
    expect(lu.total).toBe(20 + 12 + 10 + 6 + 11 + 15);
  });

  it("uses players with several positions where they fit", () => {
    const roster = [player("flexy", "RB", 14, { elig: ["RB", "WR"] }), player("rb", "RB", 10)];
    const lu = bestLineup(roster, ["RB", "WR"], NFL);
    expect(lu.slots.map((p) => p?.id ?? null)).toEqual(["flexy", null]);
    // Greedy by value: the best player takes the first slot it fits.
    const wrFirst = bestLineup(roster, ["WR", "RB"], NFL);
    expect(wrFirst.slots.map((p) => p?.id ?? null)).toEqual(["flexy", "rb"]);
  });

  it("leaves out injured-reserve and zero-value players", () => {
    const roster = [player("ir", "WR", 30, { startable: false }), player("zero", "WR", 0)];
    expect(bestLineup(roster, ["WR"], NFL).slots).toEqual([null]);
  });
});

describe("replacementLevels", () => {
  it("averages the best players left after every team fills its slots", () => {
    const pool = [30, 25, 20, 15, 12, 9, 6].map((v, i) => player(`rb${i}`, "RB", v));
    // Two teams, one RB slot each: 30 and 25 start; the next three average 15.67.
    const repl = replacementLevels(pool, ["RB"], 2, NFL);
    expect(repl.RB).toBeCloseTo((20 + 15 + 12) / 3);
    expect(repl.QB).toBe(0);
  });

  it("lets flex slots take players from any eligible position", () => {
    const pool = [
      ...[20, 18, 10].map((v, i) => player(`rb${i}`, "RB", v)),
      ...[19, 9, 8].map((v, i) => player(`wr${i}`, "WR", v)),
    ];
    // One team: RB 20, WR 19, FLEX takes RB 18. Left: RB 10; WR 9, 8.
    const repl = replacementLevels(pool, ["RB", "WR", "FLEX"], 1, NFL);
    expect(repl.RB).toBe(10);
    expect(repl.WR).toBe(8.5);
  });

  it("keeps bench depth out of the free-agent pool", () => {
    const pool = [30, 25, 20, 15, 12, 9, 6].map((v, i) => player(`rb${i}`, "RB", v));
    const deep = { ...NFL, model: { ...NFL.model, benchDepth: { RB: 1 } } };
    // Two teams start 30 and 25 and keep 20 and 15 on the bench: 12, 9, 6 are left.
    expect(replacementLevels(pool, ["RB"], 2, deep).RB).toBeCloseTo((12 + 9 + 6) / 3);
    // Without depth, 20, 15 and 12 would be free agents.
    expect(replacementLevels(pool, ["RB"], 2, NFL).RB).toBeCloseTo((20 + 15 + 12) / 3);
  });

  it("skips players who cannot be started", () => {
    const pool = [
      player("a", "TE", 10),
      player("b", "TE", 50, { startable: false }),
      player("c", "TE", 4),
    ];
    expect(replacementLevels(pool, ["TE"], 1, NFL).TE).toBe(4);
  });
});

describe("buildModel", () => {
  const stats = {
    generated_at: "2026-01-01T00:00:00+00:00",
    season: "2026",
    prev_season: "2025",
    weeks: [1, 2],
    keys: ["rec", "rec_yd"],
    players: {
      "1": {
        n: "Veteran",
        p: "WR",
        fp: ["WR"],
        prev: { g: 10, s: [0, 50, 1, 700] },
        w: { "1": [0, 5, 1, 60] },
      },
      "2": { n: "Idp", p: "LB", fp: ["LB"], w: { "1": [0, 1] } },
      "3": { n: "Hybrid", p: "WR", fp: ["WR", "RB"], w: { "2": [1, 100] } },
    },
  };
  const league = {
    roster_positions: ["WR", "FLEX", "BN", "LB"],
    scoring_settings: { rec: 1, rec_yd: 0.1 },
    total_rosters: 1,
  };

  it("skips unsupported positions and bench/IDP slots", () => {
    const model = buildModel(stats, league, NFL);
    expect(Object.keys(model.players)).toEqual(["1", "3"]);
    expect(modelSlots(league, NFL)).toEqual(["WR", "FLEX"]);
    expect(model.teams).toBe(1);
  });

  it("scores each week and last season with the league's rules", () => {
    const vet = buildModel(stats, league, NFL).players["1"]!;
    expect(vet.weekly).toEqual([
      { week: 1, pts: 11 },
      { week: 2, pts: null },
    ]);
    expect(vet.prevPpg).toBe(12);
    expect(vet.g).toBe(1);
  });

  it("keeps every fantasy position a player is eligible for", () => {
    expect(buildModel(stats, league, NFL).players["3"]!.elig).toEqual(["WR", "RB"]);
  });

  it("falls back to the sport's default team count", () => {
    expect(buildModel(stats, { roster_positions: ["WR"] }, NFL).teams).toBe(NFL.defaultTeams);
  });
});

describe("trades", () => {
  // Minimal sport so that small hand-built rosters are easy to reason about.
  const sport: SportConfig = { ...NFL, freeAgentPositions: ["RB", "WR"] };
  const model: Model = { players: {}, repl: { RB: 5, WR: 4 }, slots: ["RB", "WR"], teams: 2 };
  const base = (list: Player[]) => bestLineup(list, model.slots, sport).total;

  it("fills an open roster spot with a replacement-level free agent", () => {
    const mine = [player("rb", "RB", 12, { vorp: 7 }), player("wr", "WR", 11, { vorp: 7 })];
    const theirs = [player("star", "RB", 20, { vorp: 15 }), player("wr2", "WR", 6, { vorp: 2 })];
    const r = evaluateTrade(
      mine,
      theirs,
      [mine[0]!, mine[1]!],
      [theirs[0]!],
      base(mine),
      base(theirs),
      model,
      sport,
    );
    expect(r.myOpen).toBe(1);
    expect(r.theirOpen).toBe(0);
    // Me: star RB 20 + free-agent WR 4. Them: RB 12 + WR 11 (bench WR 6).
    expect(r.meAfter).toBe(24);
    expect(r.dMe).toBe(24 - 23);
    expect(r.themAfter).toBe(23);
    expect(r.vGive).toBe(14);
    expect(r.vGet).toBe(15);
    expect(r.fairness).toBeCloseTo(14 / 15);
  });

  it("counts a trade with no value on either side as even", () => {
    const a = [player("a", "RB", 5)];
    const b = [player("b", "RB", 5)];
    expect(evaluateTrade(a, b, a, b, 5, 5, model, sport).fairness).toBe(1);
  });

  it("lists singles first, then every pair", () => {
    expect(combos(["a", "b", "c"])).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["a", "b"],
      ["a", "c"],
      ["b", "c"],
    ]);
  });

  it("only suggests trades that help both lineups and stay close in value", () => {
    // I have two good RBs and a weak WR; they have two good WRs and a weak RB.
    const rosters = [
      {
        rid: 1,
        players: [
          player("rbA", "RB", 15, { vorp: 10 }),
          player("rbB", "RB", 14, { vorp: 9 }),
          player("wrWeak", "WR", 5, { vorp: 1 }),
        ],
      },
      {
        rid: 2,
        players: [
          player("wrA", "WR", 14, { vorp: 10 }),
          player("wrB", "WR", 13, { vorp: 9 }),
          player("rbWeak", "RB", 6, { vorp: 1 }),
        ],
      },
      // A team with nothing to offer.
      { rid: 3, players: [player("meh", "WR", 4.5, { vorp: 0.5 })] },
    ];
    const ideas = suggestTrades(1, rosters, model, sport);
    expect(ideas.length).toBeGreaterThan(0);
    for (const r of ideas) {
      expect(r.partner).toBe(2);
      expect(r.dMe).toBeGreaterThanOrEqual(P.minGainMe);
      expect(r.dThem).toBeGreaterThanOrEqual(P.minGainThem);
      expect(r.fairness).toBeGreaterThanOrEqual(P.minFairness);
    }
    // Best idea: my second RB for their best WR (me +9, them +7, score 9 + 0.6 × 7).
    expect(ideas[0]!.give.map((p) => p.id)).toEqual(["rbB"]);
    expect(ideas[0]!.get.map((p) => p.id)).toEqual(["wrA"]);
    expect(ideas[0]!.score).toBeCloseTo(9 + 0.6 * 7);
  });

  it("picks different partners first and never offers the same player twice", () => {
    const idea = (partner: number, give: string, score: number) =>
      ({ partner, give: [player(give, "RB", 1)], get: [], score }) as unknown as TradeIdea;
    const sorted = [
      idea(2, "x", 9),
      idea(2, "y", 8),
      idea(3, "x", 7),
      idea(4, "z", 6),
      idea(2, "w", 5),
    ];
    const picked = pickDiverse(sorted, 3);
    expect(picked.map((r) => [r.partner, r.give[0]!.id])).toEqual([
      [2, "x"],
      [4, "z"],
      [2, "y"],
    ]);
  });
});

describe("verdict", () => {
  it("labels the balance by the difference in value above replacement", () => {
    expect(verdict({ vGive: 10, vGet: 10.5 }, P)).toEqual({ cls: "fair", text: "Balanced" });
    expect(verdict({ vGive: 10, vGet: 12 }, P)).toEqual({
      cls: "lean",
      text: "Slightly favors you",
    });
    expect(verdict({ vGive: 12, vGet: 10 }, P)).toEqual({
      cls: "lean",
      text: "Slightly favors them",
    });
    expect(verdict({ vGive: 5, vGet: 10 }, P)).toEqual({ cls: "skew", text: "Clearly favors you" });
    expect(verdict({ vGive: 0, vGet: 0 }, P)).toEqual({ cls: "fair", text: "Balanced" });
  });
});

describe("estimate with the calibrated settings", () => {
  const C = NFL_LIVE.model;
  const vet = (g: number, extra: Partial<ValueInputs> = {}) =>
    inputs({ g, seasonAvg: 12, lastAvg: 12, prevG: 16, prevPpg: 10, ...extra });

  it("fades last season by reliability, 3 / (3 + games)", () => {
    expect(estimate(vet(1), null, C).weights.prev).toBeCloseTo(0.75);
    expect(estimate(vet(3), null, C).weights.prev).toBeCloseTo(0.5);
    expect(estimate(vet(9), null, C).weights.prev).toBeCloseTo(0.25);
  });

  it("counts recent form only after more games than the window", () => {
    expect(estimate(vet(3), null, C).weights.recent).toBe(0);
    expect(estimate(vet(4), null, C).weights.recent).toBeGreaterThan(0);
  });

  it("keeps a quarter of a player's value when he has no team, and never starts him", () => {
    const signed = estimate(vet(0), null, C);
    const unsigned = estimate(vet(0, { noTeam: true }), null, C);
    expect(unsigned.value).toBeCloseTo(signed.value * 0.25);
    expect(unsigned.startable).toBe(false);
  });

  it("leaves players without a team alone in the prototype settings", () => {
    expect(estimate(vet(0, { noTeam: true }), null, P)).toMatchObject({
      value: 10,
      startable: true,
    });
  });
});
