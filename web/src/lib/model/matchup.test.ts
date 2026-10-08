import { describe, expect, it } from "vitest";
import { matchupLevel, matchupNote } from "./matchup";

describe("matchups", () => {
  it("calls a matchup good or tough from 8% off the average", () => {
    expect([1.08, 1.07, 0.93, 0.92].map(matchupLevel)).toEqual([
      "good",
      "neutral",
      "neutral",
      "tough",
    ]);
  });

  it("puts the matchup in words for the tooltip", () => {
    expect(matchupNote("BUF", 1.124, "RB")).toBe("BUF allows 12% more points than average to RBs");
    expect(matchupNote("NYJ", 0.9, "WR")).toBe("NYJ allows 10% fewer points than average to WRs");
    expect(matchupNote("KC", 1.03, "TE")).toBe("KC allows about the average to TEs");
  });
});
