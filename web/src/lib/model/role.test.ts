import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import { buildModel } from "./build";
import { playerRole, seasonOver, type RoleInputs } from "./role";
import { playerScores } from "./score";
import type { StatsFile, StatsPlayer } from "./types";

const ENDING = NFL.model.seasonEnding;
const ROLES = NFL.model.roles;

describe("season-ending injuries", () => {
  it("ends the season of a player hurt this season with a torn ACL or Achilles on IR", () => {
    expect(seasonOver({ inj: "IR", bodyPart: "Knee - ACL", g: 3 }, ENDING)).toBe(true);
    expect(seasonOver({ inj: "IR", bodyPart: "Knee - ACL + MCL", g: 1 }, ENDING)).toBe(true);
    expect(seasonOver({ inj: "IR", bodyPart: "Achilles", g: 2 }, ENDING)).toBe(true);
  });

  it("keeps other injuries, statuses and old injuries he is coming back from", () => {
    expect(seasonOver({ inj: "IR", bodyPart: "Ankle", g: 3 }, ENDING)).toBe(false);
    // A PCL is not an ACL: words are matched whole.
    expect(seasonOver({ inj: "IR", bodyPart: "Knee - PCL", g: 3 }, ENDING)).toBe(false);
    expect(seasonOver({ inj: "Out", bodyPart: "Knee - ACL", g: 3 }, ENDING)).toBe(false);
    // Torn last season, no games yet: on his way back.
    expect(seasonOver({ inj: "PUP", bodyPart: "Knee - ACL", g: 0 }, ENDING)).toBe(false);
    expect(seasonOver({ inj: "IR", bodyPart: "Knee - ACL", g: 0 }, ENDING)).toBe(false);
    expect(seasonOver({ inj: "IR", bodyPart: undefined, g: 3 }, ENDING)).toBe(false);
    expect(seasonOver({ inj: "IR", bodyPart: "Knee - ACL", g: 3 }, null)).toBe(false);
  });
});

describe("roles", () => {
  const base: RoleInputs = {
    pos: "RB",
    g: 5,
    lastAvg: 15,
    prior: 12,
    depth: ["RB", 1],
    usage: 0.8,
    injured: false,
  };

  it("calls a lead the starter with lead usage and form far above his prior", () => {
    expect(playerRole({ ...base, prior: 2 }, ROLES)).toBe("lead");
    // A rookie without a prior.
    expect(playerRole({ ...base, prior: null }, ROLES)).toBe("lead");
  });

  it("does not call a lead a player who was expected to start, nor a hot backup", () => {
    expect(playerRole(base, ROLES)).toBeNull();
    expect(playerRole({ ...base, prior: 2, usage: 0.3 }, ROLES)).toBeNull();
    expect(playerRole({ ...base, prior: 2, depth: ["RB", 2] }, ROLES)).toBeNull();
    expect(playerRole({ ...base, prior: 2, g: 1 }, ROLES)).toBeNull();
  });

  it("calls a backup a player behind the starters with little usage, unless he is hurt", () => {
    const deep: RoleInputs = { ...base, depth: ["RB", 3], usage: 0.1 };
    expect(playerRole(deep, ROLES)).toBe("backup");
    expect(playerRole({ ...deep, usage: 0.5 }, ROLES)).toBeNull();
    expect(playerRole({ ...deep, depth: ["RB", 2] }, ROLES)).toBeNull();
    expect(playerRole({ ...deep, injured: true }, ROLES)).toBeNull();
    // A receiver second at his slot is behind a starter.
    expect(playerRole({ ...deep, pos: "WR", depth: ["SWR", 2] }, ROLES)).toBe("backup");
  });

  it("says nothing without a depth chart, a usage measure or the rule", () => {
    expect(playerRole({ ...base, prior: 2, depth: undefined }, ROLES)).toBeNull();
    expect(playerRole({ ...base, prior: 2, usage: undefined }, ROLES)).toBeNull();
    expect(playerRole({ ...base, prior: 2 }, null)).toBeNull();
  });
});

describe("roles and season-ending injuries in the model", () => {
  // Keys: rec_tgt 0, rush_att 1, rush_yd 2. Team AAA has 30 carries a week.
  const week = (carries: number, yards: number) => [1, carries, 2, yards];
  const games = (carries: number, yards: number) => ({
    w: { "1": week(carries, yards), "2": week(carries, yards), "3": week(carries, yards) },
    tw: { "1": "AAA", "2": "AAA", "3": "AAA" },
  });
  const rb = (extra: StatsPlayer): StatsPlayer => ({ p: "RB", fp: ["RB"], t: "AAA", ...extra });
  const players: Record<string, StatsPlayer> = {
    // Expected to start, then tore his ACL in week 1.
    star: rb({ ...games(0, 0), w: { "1": week(5, 30) }, tw: { "1": "AAA" }, i: "IR" }),
    // A deep backup before the season who took the job (a veteran: rookies fade fast anyway).
    heir: rb({ ...games(20, 120), proj: [2, 300], prev: { g: 17, s: [2, 300] }, dc: ["RB", 1] }),
    // The same games, expected to start all along.
    starter: rb({ ...games(20, 120), proj: [2, 1500], dc: ["RB", 1] }),
    // Third on the depth chart, barely used.
    deep: rb({ ...games(2, 50), proj: [2, 1000], dc: ["RB", 3] }),
  };
  const stats = (extra: Partial<Record<string, StatsPlayer>> = {}): StatsFile => ({
    generated_at: "",
    season: "2026",
    prev_season: "2025",
    weeks: [1, 2, 3],
    keys: ["rec_tgt", "rush_att", "rush_yd"],
    usage_keys: ["rec_tgt", "rush_att", "rec_rz_tgt"],
    team_weeks: { AAA: { "1": [0, 30, 0], "2": [0, 30, 0], "3": [0, 30, 0] } },
    players: { ...players, ...extra } as Record<string, StatsPlayer>,
  });
  const league = { roster_positions: ["RB"], scoring_settings: { rush_yd: 0.1 } };
  const run = (file: StatsFile) => {
    const model = buildModel(file, league, NFL);
    return { model, scores: playerScores(model, file, [], NFL) };
  };

  it("leaves a torn ACL from this season with nothing", () => {
    const { model, scores } = run(stats({ star: { ...players.star, ib: "Knee - ACL" } }));
    expect(model.players.star!.seasonOver).toBe(true);
    expect(model.players.star!.value).toBe(0);
    expect(model.players.star!.startable).toBe(false);
    expect(scores.get("star")!.trade).toBe(1);
    const sprain = run(stats({ star: { ...players.star, ib: "Ankle" } }));
    expect(sprain.scores.get("star")!.trade).toBeGreaterThan(1);
  });

  it("lets a player who took the job shake off his preseason prior", () => {
    const { model, scores } = run(stats());
    expect(model.players.heir!.role).toBe("lead");
    expect(model.players.starter!.role).toBeNull();
    const without = run(stats({ heir: { ...players.heir, dc: undefined } }));
    expect(model.players.heir!.value).toBeGreaterThan(without.model.players.heir!.value);
    expect(scores.get("heir")!.trade).toBeGreaterThan(without.scores.get("heir")!.trade);
  });

  it("judges a rookie sooner on his games than a veteran with the same projection", () => {
    const vet = { ...players.heir, dc: undefined };
    const rookie = { ...vet, prev: undefined };
    const { model } = run(stats({ vet, rookie }));
    // Both beat a modest projection; the rookie's projection is all there is, so it weighs less.
    expect(model.players.rookie!.value).toBeGreaterThan(model.players.vet!.value);
    const off = buildModel(stats({ vet, rookie }), league, {
      ...NFL,
      model: { ...NFL.model, rookiePriorGames: 0 },
    });
    expect(off.players.rookie!.value).toBeCloseTo(off.players.vet!.value);
  });

  it("cuts a backup's trade value but not his points", () => {
    const { model, scores } = run(stats());
    expect(model.players.deep!.role).toBe("backup");
    const listed = run(stats({ deep: { ...players.deep, dc: ["RB", 2] } }));
    expect(model.players.deep!.value).toBeCloseTo(listed.model.players.deep!.value);
    expect(scores.get("deep")!.trade).toBeLessThan(listed.scores.get("deep")!.trade);
  });
});
