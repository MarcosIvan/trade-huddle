/** What changes for the NBA: game days as periods, per-game projections and its trade value. */
import { describe, expect, it } from "vitest";
import { tradeValueHint } from "../../components/Player";
import { sportOf } from "../sports";
import { NBA } from "../sports/nba";
import { NFL } from "../sports/nfl";
import { buildModel } from "./build";
import { currentPeriod, lineupPeriods, periodWeek, weekPeriods } from "./periods";
import { playerCard } from "./playerCard";
import { playerScores } from "./score";
import type { Model, Player, StatsFile } from "./types";

const keys = ["pts", "reb", "ast"];

/** Week 1 is days 1-3, week 2 days 8-10; AAA plays on days 1, 3, 8 and 10. */
const stats: StatsFile = {
  generated_at: "2026-10-23T10:00:00Z",
  season: "2026",
  prev_season: "2025",
  period: "day",
  weeks: [1, 3],
  keys,
  season_games: 82,
  proj_per_game: true,
  lineup_week: 2,
  day_weeks: { "1": 1, "2": 1, "3": 1, "8": 2, "10": 2 },
  day_dates: {
    "1": "2026-10-20",
    "2": "2026-10-21",
    "3": "2026-10-22",
    "8": "2026-10-27",
    "10": "2026-10-29",
  },
  schedule: {
    "1": [["BBB", "AAA"]],
    "2": [["CCC", "BBB"]],
    "3": [["AAA", "DDD"]],
    "8": [["CCC", "AAA"]],
    "10": [["AAA", "BBB"]],
  },
  players: {
    g1: {
      n: "Guard One",
      p: "PG",
      fp: ["PG", "SG"],
      t: "AAA",
      w: { "1": [0, 20, 1, 5, 2, 8], "3": [0, 30, 1, 4, 2, 6] },
      tw: { "1": "AAA", "3": "AAA" },
      // Per-game projections: 25 points, 5 rebounds, 7 assists a game.
      proj: [0, 25, 1, 5, 2, 7],
      wp: { "8": [0, 26, 1, 5, 2, 7], "10": [0, 24, 1, 5, 2, 7] },
    },
  },
};

const league = {
  roster_positions: ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "BN"],
  scoring_settings: { pts: 0.5, reb: 1, ast: 1 },
  total_rosters: 2,
};

describe("periods", () => {
  it("are the week itself in the NFL", () => {
    const nfl: StatsFile = { ...stats, period: undefined, lineup_week: 5, weeks: [1, 2, 3, 4] };
    expect(weekPeriods(nfl, 5)).toEqual([5]);
    expect(lineupPeriods(nfl)).toEqual([5]);
    expect(currentPeriod(nfl)).toBe(5);
    expect(periodWeek(nfl, 4)).toBe(4);
  });

  it("are the week's game days in the NBA", () => {
    expect(weekPeriods(stats, 1)).toEqual([1, 2, 3]);
    expect(lineupPeriods(stats)).toEqual([8, 10]);
    expect(currentPeriod(stats)).toBe(8);
    expect(periodWeek(stats, 10)).toBe(2);
  });

  it("go on from the last period played after the season", () => {
    expect(currentPeriod({ ...stats, lineup_week: null })).toBe(4);
  });
});

describe("NBA model", () => {
  const model = buildModel(stats, league, NBA);
  const guard = model.players.g1!;

  it("reads preseason projections as per-game averages", () => {
    // 25 × 0.5 + 5 + 7, not divided by 82 games.
    expect(guard.projPpg).toBeCloseTo(24.5);
  });

  it("counts each game day as a game", () => {
    expect(guard.g).toBe(2);
    expect(guard.seasonAvg).toBeCloseTo((10 + 5 + 8 + 15 + 4 + 6) / 2);
  });

  it("takes the next game from the lineup week's first projected day", () => {
    expect(guard.nextGamePpg).toBeCloseTo(13 + 5 + 7);
  });

  it("shows only the days his team plays on the player card", () => {
    const card = playerCard(guard, stats, new Map(), NBA);
    expect(card.games.map((g) => g.week)).toEqual([1, 3]);
    expect(card.upcoming.map((g) => g.week)).toEqual([8, 10]);
    expect([...card.games, ...card.upcoming].some((g) => g.bye)).toBe(false);
  });
});

describe("NBA trade value", () => {
  const player = (id: string, pos: string, value: number): Player =>
    ({
      id,
      name: id,
      pos,
      elig: [pos],
      value,
      vorp: value - 10,
      startable: true,
      team: "AAA",
      noTeam: false,
      inj: null,
      weekly: [],
      g: 0,
      seasonAvg: null,
      lastAvg: null,
      prevG: 70,
      prevPpg: value,
      projPpg: value,
      injMult: 1,
    }) as unknown as Player;
  const players = {
    star: player("star", "C", 40),
    early: player("early", "C", 25),
    late: player("late", "C", 25),
    guard: player("guard", "PG", 25),
    rep: player("rep", "PG", 10),
  };
  const model: Model = {
    players,
    repl: { C: 10, PG: 10 },
    slots: ["C", "PG"],
    teams: 2,
    adpFormat: "std",
  };
  const adp = (pick: number) => ({ n: "", p: "", fp: [], t: "AAA", adp: { std: pick } });
  const file: StatsFile = {
    ...stats,
    players: { star: adp(1), early: adp(8), late: adp(150), guard: adp(150) },
  };
  const scores = playerScores(model, file, [], NBA);
  const trade = (id: string) => scores.get(id)!.trade;

  it("discounts centers the draft market does not rate, less for those it does", () => {
    expect(trade("late")).toBeLessThan(trade("early"));
    expect(trade("late")).toBeLessThan(trade("guard"));
  });

  it("keeps the best player at the top of the scale", () => {
    expect(trade("star")).toBe(40);
  });
});

describe("sports", () => {
  it("are chosen by the league's sport, the NFL by default", () => {
    expect(sportOf("nba")).toBe(NBA);
    expect(sportOf("nfl")).toBe(NFL);
    expect(sportOf(undefined)).toBe(NFL);
  });

  it("explain trade value with each sport's measures", () => {
    expect(tradeValueHint(NFL)).toBe(
      "Trade value, 1 to 40: expected points, positional scarcity, NFL usage, this season, draft market, last 3 games and proven base; stars off to a slow start keep part of their draft rank's value.",
    );
    expect(tradeValueHint(NBA)).toBe(
      "Trade value, 1 to 40: expected points, positional scarcity, this season, draft market, last 12 games and proven base.",
    );
  });
});
