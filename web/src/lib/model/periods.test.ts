import { describe, expect, it } from "vitest";
import { periodsAhead } from "./periods";
import type { StatsFile } from "./types";

describe("periods ahead", () => {
  it("leaves only the game days of the lineup week after the last one played", () => {
    const days = {
      period: "day",
      weeks: [1, 2, 3],
      lineup_week: 1,
      day_weeks: { "1": 1, "2": 1, "3": 1, "4": 1, "5": 2 },
    } as unknown as StatsFile;
    expect(periodsAhead(days)).toEqual([4]);
    expect(periodsAhead(days, "AAA")).toEqual([4]);
  });

  it("keeps the lineup week for a team whose game is not in the stats yet", () => {
    // Week 8 began with one game: BBB played it, AAA plays later in the week.
    const weeks = {
      weeks: [1, 2, 3, 4, 5, 6, 7, 8],
      lineup_week: 8,
      team_weeks: { AAA: { "7": [30] }, BBB: { "7": [30], "8": [30] } },
    } as unknown as StatsFile;
    expect(periodsAhead(weeks, "AAA")).toEqual([8]);
    expect(periodsAhead(weeks, "BBB")).toEqual([]);
    // A team with no game in the stats has the whole week ahead.
    expect(periodsAhead(weeks, "CCC")).toEqual([8]);
    expect(periodsAhead(weeks)).toEqual([]);
    expect(periodsAhead({ ...weeks, weeks: [1, 2, 3, 4, 5, 6, 7] }, "BBB")).toEqual([8]);
  });
});
