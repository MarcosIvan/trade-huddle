import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import type { SportConfig } from "../sports/types";
import { findTargetTrades, isIdeaShape, topAtPosition } from "./trades";
import type { Model, Player } from "./types";

function player(id: string, pos: string, value: number, vorp: number): Player {
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
  } as unknown as Player;
}

describe("trade finder: a top player at a position", () => {
  const slots = ["QB", "RB", "RB", "WR", "WR"];
  const sport: SportConfig = { ...NFL, freeAgentPositions: [] };
  const mine = [
    player("myQb", "QB", 20, 4),
    player("myRb1", "RB", 15, 7),
    player("myRb2", "RB", 13, 5),
    player("myRb3", "RB", 9, 1),
    player("myWr1", "WR", 16, 8),
    player("myWr2", "WR", 14, 6),
    player("myWr3", "WR", 11, 3),
  ];
  const theirs = [
    player("tQb", "QB", 19, 3),
    player("tRb1", "RB", 19, 11),
    player("tRb2", "RB", 10, 2),
    player("tWr1", "WR", 13, 5),
    player("tWr2", "WR", 10, 2),
    player("tWr3", "WR", 9, 1),
  ];
  const others = [
    player("oQb", "QB", 18, 2),
    player("oRb1", "RB", 17, 9),
    player("oRb2", "RB", 9, 1),
    player("oWr1", "WR", 12, 4),
    player("oWr2", "WR", 10, 2),
    player("oWr3", "WR", 8, 0),
  ];
  const all = Object.fromEntries([...mine, ...theirs, ...others].map((p) => [p.id, p]));
  const model: Model = { players: all, repl: { QB: 16, RB: 8, WR: 8 }, slots, teams: 3 };
  const rosters = [
    { rid: 1, players: mine },
    { rid: 2, players: theirs },
    { rid: 3, players: others },
  ];
  const values = new Map(Object.values(all).map((p) => [p.id, p.value * 2] as const));
  const worth = (p: Player) => values.get(p.id) ?? 0;
  const topRbs = new Set(["tRb1", "oRb1"]);

  it("ranks a position's players by trade value across the league", () => {
    const ids = topAtPosition(rosters, "RB", 3, worth).map((p) => p.id);
    expect(ids).toEqual(["tRb1", "oRb1", "myRb1"]);
  });

  it("brings a top player at the position, always 2-for-2 and sending the chosen player", () => {
    const target = { pos: "RB", top: 3, offerId: "myRb2" };
    const { ideas } = findTargetTrades(target, 1, rosters, model, sport, values);
    expect(ideas).toHaveLength(3);
    for (const r of ideas) {
      expect(r.give).toHaveLength(2);
      expect(r.get).toHaveLength(2);
      expect(r.give.map((p) => p.id)).toContain("myRb2");
      expect(r.get.some((p) => topRbs.has(p.id))).toBe(true);
      if (!r.problems) expect(isIdeaShape(r.give, r.get, worth)).toBe(true);
    }
    expect(new Set(ideas.map((r) => r.partner)).size).toBeGreaterThan(1);
  });

  it("sends any of your players when none is chosen", () => {
    const target = { pos: "RB", top: 3, offerId: null };
    const { ideas } = findTargetTrades(target, 1, rosters, model, sport, values);
    expect(ideas.length).toBeGreaterThan(0);
    for (const r of ideas) {
      expect(r.give).toHaveLength(2);
      expect(r.get.some((p) => topRbs.has(p.id))).toBe(true);
    }
  });

  it("only looks at the tier asked for", () => {
    const target = { pos: "RB", top: 1, offerId: "myRb2" };
    for (const r of findTargetTrades(target, 1, rosters, model, sport, values).ideas) {
      expect(r.partner).toBe(2);
      expect(r.get.map((p) => p.id)).toContain("tRb1");
    }
  });

  it("adds no quarterback in a one-QB league and refuses a player you do not have", () => {
    const target = { pos: "WR", top: 3, offerId: null };
    for (const r of findTargetTrades(target, 1, rosters, model, sport, values).ideas) {
      expect([...r.give, ...r.get].some((p) => p.pos === "QB")).toBe(false);
    }
    const stranger = { pos: "RB", top: 3, offerId: "tRb2" };
    expect(findTargetTrades(stranger, 1, rosters, model, sport, values).ideas).toEqual([]);
  });

  it("finds nothing when the only top players are yours", () => {
    const target = { pos: "WR", top: 2, offerId: null };
    expect(findTargetTrades(target, 1, rosters, model, sport, values).ideas).toEqual([]);
  });
});
