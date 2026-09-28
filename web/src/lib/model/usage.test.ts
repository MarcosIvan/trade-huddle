import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { buildModel } from "./build";
import type { StatsFile, StatsPlayer } from "./types";
import { expectedPoints, fitPointsPerOpportunity, type UsageSample } from "./usage";

describe("fitPointsPerOpportunity", () => {
  it("recovers what each opportunity is worth", () => {
    const samples: UsageSample[] = [];
    for (let t = 0; t < 12; t++) {
      for (let c = 0; c < 6; c++)
        samples.push({ x: [t, c, t % 3], y: 1.5 * t + 0.6 * c + 2 * (t % 3) });
    }
    const coef = fitPointsPerOpportunity(samples)!;
    expect(coef[0]).toBeCloseTo(1.5, 1);
    expect(coef[1]).toBeCloseTo(0.6, 1);
    expect(coef[2]).toBeCloseTo(2, 1);
    expect(expectedPoints(coef, [10, 0, 1])).toBeCloseTo(17, 0);
  });

  it("does not trust a fit with too few games", () => {
    expect(fitPointsPerOpportunity([{ x: [5, 0, 0], y: 7 }])).toBeNull();
  });
});

describe("usage in the value model", () => {
  // 60 receivers whose points follow their targets (1.5 per target), plus one
  // who gets 10 targets a game but has been unlucky (5 points each game).
  const keys = ["rec_tgt", "rec_yd"];
  const players: Record<string, StatsPlayer> = {};
  for (let i = 0; i < 60; i++) {
    const tgt = 2 + (i % 10);
    players[`wr${i}`] = {
      n: `Receiver ${i}`,
      p: "WR",
      fp: ["WR"],
      t: "AAA",
      w: { "1": [0, tgt, 1, 15 * tgt], "2": [0, tgt, 1, 15 * tgt] },
    };
  }
  players.unlucky = {
    n: "Unlucky",
    p: "WR",
    fp: ["WR"],
    t: "AAA",
    w: { "1": [0, 10, 1, 50], "2": [0, 10, 1, 50] },
  };
  const stats: StatsFile = {
    generated_at: "2026-01-01T00:00:00+00:00",
    season: "2026",
    prev_season: "2025",
    weeks: [1, 2],
    keys,
    players,
  };
  const league = { roster_positions: ["WR"], scoring_settings: { rec_yd: 0.1 }, total_rosters: 1 };

  it("pulls an unlucky player toward what his targets usually produce", () => {
    const model = buildModel(stats, league, NFL);
    const unlucky = model.players.unlucky!;
    expect(unlucky.seasonAvg).toBe(5); // the real average is still what is displayed
    expect(unlucky.value).toBeGreaterThan(5);
    expect(unlucky.value).toBeLessThan(15);
  });

  it("ignores usage when the blend is off", () => {
    const off = { ...NFL, model: { ...NFL.model, usageBlend: 0 } };
    const unlucky = buildModel(stats, league, off).players.unlucky!;
    const on = buildModel(stats, league, NFL).players.unlucky!;
    expect(unlucky.value).toBeLessThan(on.value);
  });
});
