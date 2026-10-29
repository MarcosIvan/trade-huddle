import { describe, expect, it } from "vitest";
import { freeAgentRows, listable, pageCount, pageOf, projectedPeriods } from "./freeAgency";
import { makeScorer } from "./scoring";
import type { Model, Player, StatsFile } from "./types";

const player = (id: string, pos: string, extra: Partial<Player> = {}): Player =>
  ({
    id,
    name: id,
    pos,
    noTeam: false,
    g: 1,
    prevG: 0,
    projPpg: null,
    nextGamePpg: null,
    ...extra,
  }) as unknown as Player;

// Keys: 0 rec, 1 rec_yd. Scoring: 1 per catch, 0.1 per yard.
const stats = {
  generated_at: "",
  season: "2026",
  prev_season: "2025",
  weeks: [1, 2],
  keys: ["rec", "rec_yd"],
  lineup_week: 3,
  schedule: { "3": [["AAA", "BBB"]] },
  players: {
    a: { w: { "1": [0, 5, 1, 50], "2": [0, 3, 1, 30] }, wp: { "3": [0, 4, 1, 45] } },
    b: { w: { "1": [0, 8, 1, 100] }, wp: { "3": [0, 2, 1, 20] } },
    c: { wp: { "3": [0, 6, 1, 70] } },
    mine: { w: { "1": [0, 9, 1, 120] } },
  },
} as unknown as StatsFile;
const score = makeScorer(stats.keys, { rec: 1, rec_yd: 0.1 });

describe("free agency list", () => {
  const players = [
    player("a", "WR", { g: 2 }),
    player("b", "WR"),
    player("c", "WR", { g: 0, nextGamePpg: 13, team: "AAA" }),
    player("mine", "WR"),
    player("gone", "WR", { noTeam: true }),
    player("nothing", "WR", { g: 0 }),
    player("rb", "RB"),
  ];
  const model = { players: Object.fromEntries(players.map((p) => [p.id, p])) } as Model;
  const values: Record<string, number> = { a: 5, b: 9, c: 7, mine: 20 };
  const worth = (p: Player) => values[p.id] ?? 1;
  const rostered = new Set(["mine"]);

  it("lists only unrostered players on a team with something to show", () => {
    expect(listable(players[4]!)).toBe(false);
    expect(listable(players[5]!)).toBe(false);
    const ids = freeAgentRows(model, stats, score, rostered, "WR", "stats", "value", worth).map(
      (r) => r.player.id,
    );
    expect(ids).toEqual(["b", "c", "a"]);
  });

  it("adds up season stats and fantasy points under the league's scoring", () => {
    const rows = freeAgentRows(model, stats, score, rostered, "WR", "stats", "points", worth);
    expect(rows.map((r) => r.player.id)).toEqual(["b", "a", "c"]);
    expect(rows[1]).toMatchObject({ points: 16, games: 2, ppg: 8, stats: { rec: 8, rec_yd: 80 } });
    expect(rows[2]).toMatchObject({ points: 0, games: 0, ppg: null });
  });

  it("shows the week's projection for the projections view", () => {
    const rows = freeAgentRows(model, stats, score, rostered, "WR", "projections", "points", worth);
    expect(rows.map((r) => r.player.id)).toEqual(["c", "a", "b"]);
    expect(rows[0]).toMatchObject({ points: 13, games: 1, stats: { rec: 6, rec_yd: 70 } });
    expect(rows[0]!.matchups).toEqual([{ opponent: "BBB", home: false }]);
  });

  it("projects only the periods of the lineup week still to play", () => {
    const days = {
      ...stats,
      period: "day",
      weeks: [1, 2, 3],
      lineup_week: 1,
      day_weeks: { "1": 1, "2": 1, "3": 1, "4": 1, "5": 2 },
    } as unknown as StatsFile;
    expect(projectedPeriods(days)).toEqual([4]);
  });
});

describe("pages", () => {
  const list = Array.from({ length: 30 }, (_, i) => i);
  it("splits a list in pages of a fixed size", () => {
    expect(pageCount(30, 25)).toBe(2);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageOf(list, 2, 25)).toEqual([25, 26, 27, 28, 29]);
  });
  it("keeps a page past either end within the list", () => {
    expect(pageOf(list, 9, 25)).toEqual([25, 26, 27, 28, 29]);
    expect(pageOf(list, 0, 25)).toHaveLength(25);
  });
});
