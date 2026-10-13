import { describe, expect, it } from "vitest";
import { NBA } from "../sports/nba";
import { buildModel } from "./build";
import { durability, teamGames } from "./durability";
import { playerScores } from "./score";
import type { StatsFile } from "./types";

const keys = ["pts"];
const game = [0, 20];

/** Days 1-6 played; AAA plays on days 1, 2, 4 and 6, BBB on 1, 3 and 5. */
const stats: StatsFile = {
  generated_at: "2026-11-01T10:00:00Z",
  season: "2026",
  prev_season: "2025",
  period: "day",
  weeks: [1, 2, 3, 4, 5, 6],
  keys,
  season_games: 82,
  proj_per_game: true,
  schedule: {
    "1": [["AAA", "BBB"]],
    "2": [["AAA", "CCC"]],
    "3": [["BBB", "CCC"]],
    "4": [["CCC", "AAA"]],
    "5": [["BBB", "DDD"]],
    "6": [["AAA", "DDD"]],
    // Still to play: not counted.
    "7": [["AAA", "BBB"]],
  },
  players: {
    // Every AAA game.
    iron: { n: "Iron", p: "PG", t: "AAA", w: { 1: game, 2: game, 4: game, 6: game } },
    // Two of AAA's four games.
    hurt: { n: "Hurt", p: "SG", t: "AAA", w: { 1: game, 6: game } },
    // BBB on days 1 and 3, then traded to AAA: day 4 and 6 are AAA's.
    moved: {
      n: "Moved",
      p: "SF",
      t: "AAA",
      w: { 1: game, 3: game, 4: game, 6: game },
      tw: { 1: "BBB", 3: "BBB", 4: "AAA", 6: "AAA" },
    },
  },
};

const params = { lastSeason: 0, shrinkGames: 0, typical: 0.8 };

describe("durability", () => {
  it("counts his teams' games so far, following him through a trade", () => {
    expect(teamGames(stats, { id: "iron", team: "AAA" })).toBe(4);
    // BBB on days 1 and 3 (day 5 came after the trade), AAA on 4 and 6.
    expect(teamGames(stats, { id: "moved", team: "AAA" })).toBe(4);
  });

  it("is the share of his team's games he played", () => {
    expect(durability(stats, { id: "iron", team: "AAA", g: 4, prevG: 0 }, params)).toBe(1);
    expect(durability(stats, { id: "hurt", team: "AAA", g: 2, prevG: 0 }, params)).toBe(0.5);
  });

  it("starts at the typical share and moves slowly with a few games", () => {
    const shrunk = { ...params, shrinkGames: 40 };
    const none = { ...stats, weeks: [] };
    expect(durability(none, { id: "hurt", team: "AAA", g: 0, prevG: 0 }, shrunk)).toBeCloseTo(0.8);
    // (2 + 32) / (4 + 40)
    expect(durability(stats, { id: "hurt", team: "AAA", g: 2, prevG: 0 }, shrunk)).toBeCloseTo(
      34 / 44,
    );
  });

  it("lowers the NBA trade value of a player who misses games", () => {
    const league = {
      roster_positions: ["PG", "SG", "SF", "BN"],
      scoring_settings: { pts: 1 },
      total_rosters: 2,
    };
    // Same points per game; one of them missed half his team's games.
    const same = {
      ...stats,
      players: {
        iron: { ...stats.players.iron!, proj: game },
        hurt: { ...stats.players.hurt!, p: "PG", proj: game },
      },
    };
    const model = buildModel(same, league, NBA);
    // Per game he is worth as much (a bit more: fewer games, more of the projection).
    expect(model.players.hurt!.value).toBeGreaterThanOrEqual(model.players.iron!.value);
    const scores = playerScores(model, same, [], NBA);
    expect(scores.get("hurt")!.durability).toBeLessThan(scores.get("iron")!.durability);
    expect(scores.get("hurt")!.trade).toBeLessThan(scores.get("iron")!.trade);
  });
});
