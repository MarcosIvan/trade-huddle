import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { NBA } from "../sports/nba";
import { available, dropCandidates, evaluatePick, pickLevel, suggestPicks } from "./pickups";
import type { FreeAgentPool } from "./trades";
import type { Model, Player } from "./types";

function player(id: string, pos: string, value: number, extra: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    pos,
    elig: [pos],
    value,
    vorp: value,
    startable: true,
    team: "AAA",
    noTeam: false,
    inj: null,
    status: null,
    weekly: [],
    g: 3,
    seasonAvg: value,
    lastAvg: value,
    prevG: 16,
    prevPpg: value,
    projPpg: null,
    nextGamePpg: null,
    injMult: 1,
    weights: { prev: 0, season: 0, recent: 0, repl: 0 },
    context: null,
    ...extra,
  } as unknown as Player;
}

const poolOf = (players: readonly Player[]): FreeAgentPool => {
  const pool = new Map<string, Player[]>();
  for (const p of players) pool.set(p.pos, [...(pool.get(p.pos) ?? []), p]);
  for (const list of pool.values()) list.sort((a, b) => b.value - a.value);
  return pool;
};

describe("pick ideas (NFL)", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR", "TE", "FLEX"];
  const mine = [
    player("qb1", "QB", 20),
    player("qb2", "QB", 12),
    player("rb1", "RB", 16),
    player("rb2", "RB", 13),
    player("rb3", "RB", 9),
    player("rb4", "RB", 4),
    player("wr1", "WR", 15),
    player("wr2", "WR", 12),
    player("wr3", "WR", 10),
    player("wr4", "WR", 5),
    player("te1", "TE", 9),
    player("te2", "TE", 4),
    player("hurt", "RB", 14, { inj: "IR", startable: false }),
  ];
  const fas = [
    player("faRb", "RB", 11),
    player("faWr", "WR", 11.5),
    player("faTe", "TE", 6),
    player("faWeak", "WR", 3),
  ];
  const all = Object.fromEntries([...mine, ...fas].map((p) => [p.id, p]));
  const model: Model = {
    players: all,
    repl: { QB: 12, RB: 6, WR: 6, TE: 4 },
    slots,
    teams: 10,
  };
  // Trade values follow points per game here.
  const scores = new Map(Object.values(all).map((p) => [p.id, p.value] as const));
  const pool = poolOf(fas);

  it("calls a clear upgrade that keeps the lineup whole a good pickup", () => {
    const r = evaluatePick(mine, all.faRb!, all.rb4!, model, NFL, scores);
    expect(r.valueGain).toBe(7);
    expect(r.gain).toBeGreaterThanOrEqual(0);
    expect(r.lineupWarnings).toEqual([]);
    expect(r.level).toBe("green");
  });

  it("calls a pickup worth less than the player dropped a bad one", () => {
    const r = evaluatePick(mine, all.faWeak!, all.wr4!, model, NFL, scores);
    expect(r.valueGain).toBeLessThan(0);
    expect(r.level).toBe("red");
  });

  it("counts lineup gains: a free agent who starts adds to your starters", () => {
    const r = evaluatePick(mine, all.faWr!, all.wr3!, model, NFL, scores);
    expect(r.dMe).toBeGreaterThan(0);
  });

  it("never drops a player in an injured reserve spot", () => {
    expect(dropCandidates(mine, NFL.freeAgentPositions).map((p) => p.id)).not.toContain("hurt");
  });

  it("suggests up to three pickups, each adding and dropping someone different", () => {
    const ideas = suggestPicks(mine, pool, model, NFL, scores);
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.length).toBeLessThanOrEqual(3);
    expect(new Set(ideas.map((i) => i.add.id)).size).toBe(ideas.length);
    expect(new Set(ideas.map((i) => i.drop.id)).size).toBe(ideas.length);
    expect(ideas.every((i) => i.level !== "red")).toBe(true);
    expect(ideas.every((i) => i.sAdd > i.sDrop)).toBe(true);
  });

  it("puts good pickups first, the most trade value gained first", () => {
    const ideas = suggestPicks(mine, pool, model, NFL, scores);
    expect(ideas[0]!.level).toBe("green");
    const greens = ideas.filter((i) => i.level === "green");
    for (let k = 1; k < greens.length; k++) {
      expect(greens[k - 1]!.valueGain).toBeGreaterThanOrEqual(greens[k]!.valueGain);
    }
  });

  it("only suggests free agents available to play", () => {
    const hurt = [
      player("faOut", "RB", 30, { inj: "Out" }),
      player("faIr", "WR", 30, { inj: "IR" }),
      player("faDoubt", "WR", 29, { inj: "Doubtful" }),
      player("faDone", "RB", 28, { seasonOver: true }),
    ];
    const players = { ...all, ...Object.fromEntries(hurt.map((p) => [p.id, p])) };
    const s = new Map(Object.values(players).map((p) => [p.id, p.value] as const));
    const ideas = suggestPicks(mine, poolOf([...fas, ...hurt]), { ...model, players }, NFL, s);
    expect(ideas.length).toBeGreaterThan(0);
    // They are worth the most, so only the availability rule keeps them out.
    expect(ideas.every((i) => !hurt.some((h) => h.id === i.add.id))).toBe(true);
    expect(available(player("q", "WR", 10, { inj: "Questionable" }), NFL)).toBe(true);
    expect(available(player("g", "PG", 10, { inj: "GTD" }), NBA)).toBe(true);
    expect(available(player("o", "PG", 10, { inj: "Out" }), NBA)).toBe(false);
  });

  it("never adds a third QB for a player at another position", () => {
    const qb = player("faQb", "QB", 40);
    const players = { ...all, faQb: qb };
    const s = new Map(Object.values(players).map((p) => [p.id, p.value] as const));
    const m = { ...model, players };
    const ideal = { QB: 2, RB: 4, WR: 4, TE: 2 };
    expect(evaluatePick(mine, qb, all.rb4!, m, NFL, s, ideal).pilesUp).toBe(true);
    // Dropping a QB for him keeps two: a fine idea.
    expect(evaluatePick(mine, qb, all.qb2!, m, NFL, s, ideal).pilesUp).toBe(false);
    const ideas = suggestPicks(mine, poolOf([...fas, qb]), m, NFL, s, ideal);
    expect(ideas.filter((i) => i.add.id === "faQb").map((i) => i.drop.pos)).toEqual(["QB"]);
    expect(ideas.every((i) => !i.pilesUp)).toBe(true);
  });

  it("suggests nothing when no free agent beats anyone on the roster", () => {
    const weak = poolOf([player("w1", "WR", 1), player("w2", "RB", 1)]);
    const players = { ...all, w1: player("w1", "WR", 1), w2: player("w2", "RB", 1) };
    const s = new Map(Object.values(players).map((p) => [p.id, p.value] as const));
    expect(suggestPicks(mine, weak, { ...model, players }, NFL, s)).toEqual([]);
  });
});

describe("pick level", () => {
  const base = { valueGain: 2, gain: 0.5, lineupWarnings: [] };
  it("is green for a clear gain with nothing wrong", () => {
    expect(pickLevel(base)).toBe("green");
  });
  it("is yellow for a small gain or a weaker team", () => {
    expect(pickLevel({ ...base, valueGain: 0.5 })).toBe("yellow");
    expect(pickLevel({ ...base, gain: -0.5 })).toBe("yellow");
  });
  it("is red when trade value is lost or the lineup is left short", () => {
    expect(pickLevel({ ...base, valueGain: -1 })).toBe("red");
    const short = ["Leaves you 0 healthy TEs"];
    expect(pickLevel({ ...base, lineupWarnings: short })).toBe("red");
  });
});

describe("pick ideas (NBA)", () => {
  const slots = ["PG", "SG", "SF", "PF", "C", "G", "F", "UTIL"];
  const mine = [
    player("pg", "PG", 40),
    player("sg", "SG", 35),
    player("sf", "SF", 33),
    player("pf", "PF", 30),
    player("c", "C", 32),
    player("g", "PG", 25, { elig: ["PG", "SG"] }),
    player("f", "SF", 24, { elig: ["SF", "PF"] }),
    player("u", "C", 20),
    player("bench", "SG", 12),
  ];
  const fas = [player("faG", "SG", 22, { elig: ["PG", "SG"] }), player("faC", "C", 15)];
  const all = Object.fromEntries([...mine, ...fas].map((p) => [p.id, p]));
  const model: Model = {
    players: all,
    repl: { PG: 15, SG: 15, SF: 15, PF: 15, C: 15 },
    slots,
    teams: 12,
  };
  const scores = new Map(Object.values(all).map((p) => [p.id, p.value / 2] as const));

  it("swaps the weakest bench player for a better free agent", () => {
    const ideas = suggestPicks(mine, poolOf(fas), model, NBA, scores);
    expect(ideas[0]).toMatchObject({ add: { id: "faG" }, drop: { id: "bench" }, level: "green" });
  });
});
