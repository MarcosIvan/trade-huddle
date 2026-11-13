import { describe, expect, it } from "vitest";
import {
  DEFAULT_SPREAD,
  oddsLevel,
  oddsText,
  playoffByes,
  playoffOdds,
  projectedRecord,
  scoringSpread,
  type PlayoffTeam,
  type WeekScore,
} from "./playoffs";

/** Four teams: 1 plays 2 and 3 plays 4 in odd weeks, 1-3 and 2-4 in even weeks. */
function schedule(weeks: number, played: number, points: (rid: number, w: number) => number) {
  const out = new Map<number, WeekScore[]>();
  for (let w = 1; w <= weeks; w++) {
    const pairs =
      w % 2
        ? [
            [1, 2],
            [3, 4],
          ]
        : [
            [1, 3],
            [2, 4],
          ];
    out.set(
      w,
      pairs.flatMap(([a, b], id) =>
        [a!, b!].map((rid) => ({
          rid,
          matchupId: id + 1,
          points: w <= played ? points(rid, w) : 0,
        })),
      ),
    );
  }
  return out;
}

const team = (rid: number, wins: number, losses: number, strength: number): PlayoffTeam => ({
  rid,
  wins,
  losses,
  ties: 0,
  fpts: 100 * wins,
  strength,
});

describe("playoffByes", () => {
  it("fills the bracket up to the next power of two", () => {
    expect([4, 6, 8, 2, 1].map(playoffByes)).toEqual([0, 2, 0, 0, 0]);
  });
});

describe("scoringSpread", () => {
  it("averages the weeks played and pools each team's swing around its own mean", () => {
    // Team scores alternate 90 and 110 around 100: a spread of about 11.5 (sample deviation).
    const weeks = schedule(6, 4, (_, w) => (w % 2 ? 90 : 110));
    const { average, spread } = scoringSpread(weeks, 4);
    expect(average).toBe(100);
    expect(spread).toBeCloseTo(Math.sqrt(400 / 3), 5);
  });

  it("falls back to a share of the average with too few weeks", () => {
    const weeks = schedule(6, 2, () => 100);
    expect(scoringSpread(weeks, 2).spread).toBeCloseTo(DEFAULT_SPREAD * 100);
  });
});

describe("playoffOdds", () => {
  const weeks = schedule(10, 6, (rid, w) => 100 + rid + (w % 3));

  it("sends a team with every game won and the strongest lineup to the playoffs", () => {
    const table = playoffOdds({
      teams: [team(1, 6, 0, 130), team(2, 4, 2, 100), team(3, 2, 4, 100), team(4, 0, 6, 70)],
      weeks,
      lastScored: 6,
      playoffStart: 11,
      playoffTeams: 2,
      medianGame: false,
      sims: 2000,
    });
    expect(table.weeksLeft).toBe(4);
    expect(table.rows[0]!.rid).toBe(1);
    // Four games left: team 4 (0-6) can reach 4-6 at best, below team 1's 6 wins and team 2's chances.
    expect(table.rows[0]!.playoffs).toBe(1);
    expect(table.rows.find((r) => r.rid === 4)!.playoffs).toBeLessThan(0.05);
    // Every season sends exactly two teams.
    expect(table.rows.reduce((s, r) => s + r.playoffs, 0)).toBeCloseTo(2);
    // Wins and losses add up to the 10 games of the season.
    for (const r of table.rows) expect(r.projWins + r.projLosses).toBeCloseTo(10);
  });

  it("is the same every time for the same input", () => {
    const input = {
      teams: [team(1, 3, 3, 100), team(2, 3, 3, 100), team(3, 3, 3, 100), team(4, 3, 3, 100)],
      weeks,
      lastScored: 6,
      playoffStart: 11,
      playoffTeams: 2,
      medianGame: false,
      sims: 500,
    };
    expect(playoffOdds(input)).toEqual(playoffOdds(input));
  });

  it("plays the median game too, when the league has it", () => {
    const table = playoffOdds({
      teams: [team(1, 6, 6, 100), team(2, 6, 6, 100), team(3, 6, 6, 100), team(4, 6, 6, 100)],
      weeks,
      lastScored: 6,
      playoffStart: 11,
      playoffTeams: 2,
      medianGame: true,
      sims: 200,
    });
    // Four weeks, two games each.
    for (const r of table.rows) expect(r.projWins + r.projLosses).toBeCloseTo(20);
  });

  it("counts byes for a six-team bracket", () => {
    const six = schedule(4, 2, () => 100);
    const teams = [1, 2, 3, 4].map((rid) => team(rid, 1, 1, 100));
    const table = playoffOdds({
      teams,
      weeks: six,
      lastScored: 2,
      playoffStart: 5,
      playoffTeams: 6,
      medianGame: false,
      sims: 100,
    });
    expect(table.byes).toBe(2);
    expect(table.rows.reduce((s, r) => s + r.bye, 0)).toBeCloseTo(2);
  });
});

describe("projectedRecord", () => {
  it("shows whole games that add up to the season", () => {
    expect(projectedRecord(5.8, 8.2)).toBe("6-8");
    expect(projectedRecord(5.5, 8.5)).toBe("6-8");
    expect(projectedRecord(13.6, 0.4)).toBe("14-0");
  });
});

describe("odds in words", () => {
  it("colors near sure green and near out red", () => {
    expect([0.95, 0.7, 0.5, 0.2, 0.05].map(oddsLevel)).toEqual([
      "great",
      "good",
      "neutral",
      "tough",
      "brutal",
    ]);
  });

  it("never rounds a chance to a sure thing", () => {
    expect([0, 0.004, 0.5, 0.996, 1].map(oddsText)).toEqual(["0%", "<1%", "50%", ">99%", "100%"]);
  });
});
