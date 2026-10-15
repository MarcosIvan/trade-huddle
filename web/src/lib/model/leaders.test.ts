import { describe, expect, it } from "vitest";
import { positionLeaders, seasonPoints } from "./leaders";
import type { Model, Player } from "./types";

const player = (id: string, pos: string, weeks: (number | null)[]): Player =>
  ({
    id,
    name: id,
    pos,
    weekly: weeks.map((pts, i) => ({ week: i + 1, pts })),
    g: weeks.filter((w) => w !== null).length,
  }) as unknown as Player;

describe("position leaders", () => {
  const players = [
    player("a", "RB", [20, 20, null]),
    player("b", "RB", [15, 15, 15]),
    player("c", "RB", [null, null, null]),
    player("d", "WR", [30, 30, 30]),
  ];
  const model = { players: Object.fromEntries(players.map((p) => [p.id, p])) } as Model;
  const rosters = [
    { rid: 1, playerIds: ["a"] },
    { rid: 2, playerIds: ["b"] },
  ];
  const values: Record<string, number> = { a: 20, b: 25, c: 30, d: 40 };
  const worth = (p: Player) => values[p.id] ?? 0;

  it("adds up season points, skipping games not played", () => {
    expect(seasonPoints(players[0]!)).toBe(40);
  });

  it("ranks a position by trade value, free agents included", () => {
    const leaders = positionLeaders(model, rosters, "RB", "value", worth);
    expect(leaders.map((l) => l.player.id)).toEqual(["c", "b", "a"]);
    expect(leaders.map((l) => l.rid)).toEqual([null, 2, 1]);
  });

  it("ranks by season points with points per game", () => {
    const leaders = positionLeaders(model, rosters, "RB", "points", worth);
    expect(leaders.map((l) => l.player.id)).toEqual(["b", "a", "c"]);
    expect(leaders.map((l) => l.ppg)).toEqual([15, 20, null]);
  });

  it("shows only as many as asked", () => {
    expect(positionLeaders(model, rosters, "RB", "value", worth, 2)).toHaveLength(2);
  });
});
