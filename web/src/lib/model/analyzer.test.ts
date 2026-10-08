import { describe, expect, it } from "vitest";
import { rosterNotes, sideChange } from "./analyzer";
import type { TradeResult } from "./trades";
import type { FreeAgent, Player } from "./types";

const p = (id: string, value: number, lastAvg: number | null, extra: Partial<Player> = {}) =>
  ({ id, name: id, pos: "RB", team: "AAA", value, lastAvg, ...extra }) as Player;

const fa = (pos: string, value: number): FreeAgent =>
  ({ id: `fa-${pos}`, name: "Free agent", pos, value, freeAgent: true }) as FreeAgent;

const result = (extra: Partial<TradeResult>) =>
  ({
    myOpen: 0,
    theirOpen: 0,
    myPickups: [],
    theirPickups: [],
    myBackups: [],
    theirBackups: [],
    ...extra,
  }) as TradeResult;

describe("sideChange", () => {
  it("is what a side receives minus what it sends", () => {
    const change = sideChange(30, 22.5, [p("a", 14, 16)], [p("b", 9, null), p("c", 3, 2)]);
    expect(change.trade).toBe(7.5);
    expect(change.ppg).toBe(2);
    expect(change.last).toBe(14);
  });
});

describe("rosterNotes", () => {
  it("says nothing about an even trade", () => {
    expect(rosterNotes(result({}), "Rivals")).toEqual([]);
  });

  it("names the free agent to add for each open spot", () => {
    const notes = rosterNotes(
      result({ myOpen: 1, myPickups: [p("Ana Lima", 8.25, null, { pos: "WR", team: "BBB" })] }),
      "Rivals",
    );
    expect(notes).toEqual([
      "You open 1 roster spot. Best free agent to add: Ana Lima (WR, BBB, 8.3 pts/g). The numbers include him.",
    ]);
  });

  it("covers the partner's spots and both sides' depth", () => {
    const notes = rosterNotes(
      result({
        theirOpen: 2,
        theirPickups: [fa("TE", 4), fa("K", 7)],
        myBackups: [fa("RB", 5)],
        theirBackups: [fa("QB", 12)],
      }),
      "Rivals",
    );
    expect(notes).toEqual([
      "You get more players than you send, so you'll need to drop 2. Rivals opens 2 spots and would add a free agent at TE and a free agent at K.",
      "To keep your depth, add a free agent at RB from free agency (drop your weakest bench player).",
      "Rivals would add a free agent at QB from free agency for depth.",
    ]);
  });
});
