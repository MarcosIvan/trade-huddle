import { describe, expect, it } from "vitest";
import { NFL } from "../sports/nfl";
import type { Model, Player } from "./types";
import { weekLineup } from "./weekLineup";
import type { WeeklyOutlook } from "./weekly";

const player = (id: string, pos: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, pos, elig: [pos], value: 10, vorp: 0, startable: true, ...extra }) as Player;

const model = {
  players: Object.fromEntries(
    [
      player("rb1", "RB"),
      player("rb2", "RB"),
      player("rb3", "RB"),
      player("hurt", "RB", { inj: "IR" }),
    ].map((p) => [p.id, p]),
  ),
  slots: ["RB"],
} as unknown as Model;

const game = (pts: number, extra: Partial<WeeklyOutlook> = {}): WeeklyOutlook => ({
  pts,
  opponent: "BBB",
  home: true,
  matchup: 1,
  bye: false,
  availability: 1,
  games: [],
  ...extra,
});

describe("weekLineup", () => {
  const outlook = new Map([
    ["rb1", game(8)],
    ["rb2", game(15)],
    ["hurt", game(20)],
  ]);
  const team = { playerIds: ["rb1", "rb2", "rb3", "hurt"], reserveIds: ["hurt"] };
  const { lineup, bench, ir } = weekLineup(model, team, outlook, NFL);

  it("starts the best projection of the week", () => {
    expect(lineup.slots.map((r) => r?.id)).toEqual(["rb2"]);
    expect(lineup.total).toBe(15);
  });

  it("benches the rest, best first, and sits a player with no game like on a bye", () => {
    expect(bench.map((r) => r.id)).toEqual(["rb1", "rb3"]);
    expect(bench[1]!.outlook.bye).toBe(true);
    expect(bench[1]!.startable).toBe(false);
  });

  it("keeps the injured reserve out of the lineup", () => {
    expect(ir.map((r) => r.id)).toEqual(["hurt"]);
  });

  it("is empty without a team", () => {
    const none = weekLineup(model, undefined, outlook, NFL);
    expect(none.lineup.slots).toEqual([null]);
    expect(none.bench).toEqual([]);
  });
});
