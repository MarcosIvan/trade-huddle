import { describe, expect, it } from "vitest";
import { tradeReport, type LeagueTrade, type StartedWeek } from "./tradeReport";

const trade: LeagueTrade = {
  id: "t1",
  week: 3,
  created: 0,
  sides: [
    { rid: 1, players: ["a"], picks: [], faab: 0 },
    { rid: 2, players: ["b", "c"], picks: ["2027 round 2"], faab: 5 },
  ],
};

const week = (w: number, starters1: string[], starters2: string[]): [number, StartedWeek[]] => [
  w,
  [
    { rid: 1, starters: starters1, playersPoints: { a: 20, x: 9 } },
    { rid: 2, starters: starters2, playersPoints: { b: 8, c: 6 } },
  ],
];

const values: Record<string, number> = { a: 30, b: 20, c: 15 };

describe("tradeReport", () => {
  it("counts points only from the trade's week on, and only as a starter for the new team", () => {
    const weeks = new Map([
      week(2, ["a"], ["b", "c"]), // before the trade
      week(3, ["a"], ["b"]), // c on the bench
      week(4, ["x"], ["b", "c"]), // a on the bench
    ]);
    const [r] = tradeReport([trade], weeks, (id) => values[id] ?? 0);
    expect(r!.sides[0]!.points).toBe(20);
    expect(r!.sides[1]!.points).toBe(8 + 8 + 6);
    expect(r!.pointsLeader).toBe(2);
  });

  it("values each side today as the analyzer does: an extra player counts 30%", () => {
    const [r] = tradeReport([trade], new Map(), (id) => values[id] ?? 0);
    expect(r!.sides[0]!.value).toBe(30);
    expect(r!.sides[1]!.value).toBeCloseTo(20 + 0.3 * 15);
    expect(r!.valueLeader).toBe(1);
    // No week played since the trade: nobody leads on points.
    expect(r!.pointsLeader).toBeNull();
    expect(r!.sides[1]).toMatchObject({ picks: ["2027 round 2"], faab: 5 });
  });

  it("calls an even measure a draw", () => {
    const even = { ...trade, sides: trade.sides.map((s) => ({ ...s, players: ["a"] })) };
    const [r] = tradeReport([even], new Map(), (id) => values[id] ?? 0);
    expect(r!.valueLeader).toBeNull();
  });
});
