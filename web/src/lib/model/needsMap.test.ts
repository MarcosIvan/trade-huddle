import { describe, expect, it } from "vitest";
import { NBA } from "../sports/nba";
import { NFL } from "../sports/nfl";
import { needsMap, ownSlots } from "./needsMap";
import type { Model, Player } from "./types";

const player = (id: string, pos: string, value: number): Player =>
  ({ id, name: id, pos, elig: [pos], value, vorp: 0, startable: true }) as unknown as Player;

/** Five teams, one starter at each position: team i has RB value 10 + i and WR value 20 - i. */
const teams = [1, 2, 3, 4, 5].map((i) => ({
  rid: i,
  players: [
    player(`qb${i}`, "QB", 18),
    player(`rb${i}`, "RB", 10 + i),
    player(`wr${i}`, "WR", 20 - 2 * i),
    player(`te${i}`, "TE", 8),
    player(`k${i}`, "K", 8),
  ],
}));
const model = {
  players: Object.fromEntries(teams.flatMap((t) => t.players).map((p) => [p.id, p])),
  repl: {},
  slots: ["QB", "RB", "WR", "TE", "K"],
  teams: 5,
} as Model;

describe("ownSlots", () => {
  it("counts each position's own slots, superflex as a QB, other flex slots left out", () => {
    expect(ownSlots(["QB", "RB", "RB", "WR", "WR", "TE", "FLEX", "SUPER_FLEX", "BN"], NFL)).toEqual(
      { QB: 2, RB: 2, WR: 2, TE: 1 },
    );
    expect(ownSlots(["PG", "SG", "G", "F", "UTIL"], NBA)).toEqual({ PG: 1, SG: 1 });
  });
});

describe("needsMap", () => {
  const map = needsMap(teams, model, NFL);

  it("shows the tradable positions the lineup starts", () => {
    expect(map.positions).toEqual(["QB", "RB", "WR", "TE"]);
    expect(map.teams).toBe(5);
  });

  it("ranks each position's starters from the strongest, in five levels", () => {
    const row = (rid: number) => map.rows.find((r) => r.rid === rid)!;
    expect(row(5).cells.RB!.starters).toEqual({ rank: 1, level: "great", ppg: 15 });
    expect(row(1).cells.RB!.starters).toMatchObject({ rank: 5, level: "brutal" });
    expect(row(1).cells.WR!.starters).toMatchObject({ rank: 1, level: "great" });
    // Everyone ties at QB: no one is above or below the rest.
    expect(row(3).cells.QB!.starters).toMatchObject({ rank: 1, level: "neutral" });
  });

  it("has no bench cell for a team with no backup at the position", () => {
    expect(map.rows.every((r) => r.cells.RB!.bench === null)).toBe(true);
  });

  it("ranks benches, a thin one below a full one", () => {
    // Two RB slots: a bench of 9 and 9 beats a single backup of 12 (12 / 2 = 6).
    const slots = ["RB", "RB"];
    const deep = [
      {
        rid: 1,
        players: ["a", "b", "c", "d"].map((id, i) => player(id, "RB", [20, 20, 9, 9][i]!)),
      },
      { rid: 2, players: ["e", "f", "g"].map((id, i) => player(id, "RB", [20, 20, 12][i]!)) },
      { rid: 3, players: ["h", "i"].map((id) => player(id, "RB", 20)) },
    ];
    const m = needsMap(deep, { ...model, slots } as Model, NFL);
    const bench = (rid: number) => m.rows.find((r) => r.rid === rid)!.cells.RB!.bench;
    expect(bench(1)).toMatchObject({ rank: 1, ppg: 9 });
    expect(bench(2)).toMatchObject({ rank: 2, ppg: 6 });
    expect(bench(3)).toBeNull();
  });

  it("lists teams from the strongest roster to the weakest", () => {
    // Lineups: 18 + (10 + i) + (20 - 2i) + 8 + 8 = 64 - i; no bench.
    expect(map.rows.map((r) => r.rid)).toEqual([1, 2, 3, 4, 5]);
    expect(map.rows[0]!.lineup).toEqual({ rank: 1, level: "great", ppg: 63 });
    expect(map.rows[0]!.roster).toEqual(map.rows[0]!.lineup);
  });

  it("counts bench depth in the roster's strength", () => {
    // Team 5's lineup is the weakest, but a strong backup RB makes its roster the best.
    const deep = teams.map((t) =>
      t.rid === 5 ? { ...t, players: [...t.players, player("rb5b", "RB", 40)] } : t,
    );
    const withBench = { ...model, repl: { RB: 0 } } as Model;
    const m = needsMap(deep, withBench, NFL);
    expect(m.rows[0]!.rid).toBe(5);
    expect(m.rows[0]!.roster.rank).toBe(1);
  });

  it("works with the NBA's positions", () => {
    const nba = [1, 2].map((i) => ({
      rid: i,
      players: [player(`pg${i}`, "PG", 30 + i), player(`c${i}`, "C", 30 - i)],
    }));
    const nbaModel = {
      players: Object.fromEntries(nba.flatMap((t) => t.players).map((p) => [p.id, p])),
      repl: {},
      slots: ["PG", "C", "UTIL"],
      teams: 2,
    } as Model;
    const m = needsMap(nba, nbaModel, NBA);
    expect(m.positions).toEqual(["PG", "C"]);
    expect(m.rows.find((r) => r.rid === 2)!.cells.PG!.starters.rank).toBe(1);
    expect(m.rows.find((r) => r.rid === 1)!.cells.C!.starters.rank).toBe(1);
  });
});
