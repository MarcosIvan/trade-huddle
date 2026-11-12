import { describe, expect, it } from "vitest";
import { matchupNote, matchupRatings } from "./matchup";

/** Eight defenses for RBs, from the most generous (1.2) to the stingiest (0.85). */
const RB = [1.2, 1.1, 1.05, 1.01, 0.99, 0.95, 0.9, 0.85];
const factors = new Map(RB.map((f, i) => [`D${i + 1}`, new Map([["RB", f]])]));

describe("matchupRatings", () => {
  const ratings = matchupRatings(factors);
  const rb = (d: string) => ratings.get(d)!.get("RB")!;

  it("ranks every defense for the position, 1 = the easiest", () => {
    expect(RB.map((_, i) => rb(`D${i + 1}`).rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rb("D1").of).toBe(8);
  });

  it("splits the ranking in five: great, good, neutral, tough, brutal", () => {
    // Of 8: the two at each end are great (tough), the next one good (tough).
    expect(RB.map((_, i) => rb(`D${i + 1}`).level)).toEqual([
      "great",
      "great",
      "good",
      "neutral",
      "neutral",
      "tough",
      "brutal",
      "brutal",
    ]);
  });

  it("needs the factor on the right side of average", () => {
    // The two easiest allow less than average: neither is good.
    const low = new Map(
      [0.99, 0.98, 0.97, 0.96].map((f, i) => [`D${i + 1}`, new Map([["RB", f]])]),
    );
    const r = matchupRatings(low);
    expect(r.get("D1")!.get("RB")!.level).toBe("neutral");
    expect(r.get("D2")!.get("RB")!.level).toBe("neutral");
    expect(r.get("D3")!.get("RB")!.level).toBe("tough");
    expect(r.get("D4")!.get("RB")!.level).toBe("brutal");
  });

  it("rates nobody while every defense is still average", () => {
    const flat = new Map(["A", "B", "C", "D"].map((d) => [d, new Map([["RB", 1]])]));
    const r = matchupRatings(flat);
    expect([...r.values()].map((m) => m.get("RB")!.level)).toEqual([
      "neutral",
      "neutral",
      "neutral",
      "neutral",
    ]);
    expect(r.get("A")!.get("RB")!.rank).toBe(1);
  });

  it("ranks each position on its own", () => {
    const mixed = new Map([
      [
        "A",
        new Map([
          ["RB", 1.1],
          ["WR", 0.9],
        ]),
      ],
      [
        "B",
        new Map([
          ["RB", 0.9],
          ["WR", 1.1],
        ]),
      ],
    ]);
    const r = matchupRatings(mixed);
    expect(r.get("A")!.get("RB")!.level).toBe("good");
    expect(r.get("A")!.get("WR")!.level).toBe("tough");
  });
});

describe("matchupNote", () => {
  it("gives the rank and the percentage", () => {
    const r = (factor: number, rank: number) => ({
      factor,
      rank,
      of: 32,
      level: "neutral" as const,
    });
    expect(matchupNote("BUF", r(1.043, 6), "RB")).toBe(
      "BUF is the 6th easiest defense of 32 for RBs (allows 4% more points than average)",
    );
    expect(matchupNote("NYJ", r(0.97, 29), "WR")).toBe(
      "NYJ is the 29th easiest defense of 32 for WRs (allows 3% fewer points than average)",
    );
    expect(matchupNote("KC", r(1.002, 1), "TE")).toBe(
      "KC is the easiest defense of 32 for TEs (allows about the average)",
    );
  });
});
