import { describe, expect, it } from "vitest";
import { NBA } from "../sports/nba";
import { NFL } from "../sports/nfl";
import { ideaReason, ordinal, reasonText, withReasons } from "./ideaReason";
import { positionRank, positionStrength } from "./positionStrength";
import type { Model, Player } from "./types";

const player = (id: string, pos: string, value: number, extra: Partial<Player> = {}): Player =>
  ({ id, name: id, pos, elig: [pos], value, vorp: 0, startable: true, ...extra }) as Player;

describe("positionStrength", () => {
  it("averages the best healthy players a lineup starts at each position", () => {
    const list = [
      player("a", "RB", 18),
      player("b", "RB", 12),
      player("c", "RB", 30, { startable: false }),
      player("d", "WR", 9),
    ];
    expect(positionStrength(list, { RB: 2, WR: 1, TE: 1, K: 0 })).toEqual({
      RB: 15,
      WR: 9,
      TE: 0,
    });
  });

  it("ranks teams from the strongest (1), ties sharing a rank", () => {
    const s = new Map([
      [1, { RB: 10 }],
      [2, { RB: 14 }],
      [3, { RB: 10 }],
    ]);
    expect(positionRank(s, 2, "RB")).toBe(1);
    expect(positionRank(s, 1, "RB")).toBe(2);
    expect(positionRank(s, 3, "RB")).toBe(2);
  });
});

describe("ideaReason", () => {
  // One starter per position: I am deep at RB and weak at TE, the partner the opposite.
  const mine = [
    player("myQb", "QB", 20),
    player("myRb1", "RB", 18),
    player("myRb2", "RB", 12),
    player("myWr", "WR", 10),
    player("myTe", "TE", 4),
  ];
  const theirs = [
    player("tQb", "QB", 19),
    player("tRb", "RB", 9),
    player("tWr", "WR", 15),
    player("tTe1", "TE", 12),
    player("tTe2", "TE", 5),
  ];
  const third = [
    player("xQb", "QB", 18),
    player("xRb", "RB", 14),
    player("xWr", "WR", 13),
    player("xTe", "TE", 8),
  ];
  const all = Object.fromEntries([...mine, ...theirs, ...third].map((p) => [p.id, p]));
  const model = { players: all, repl: {}, slots: ["QB", "RB", "WR", "TE"], teams: 3 } as Model;
  const rosters = [
    { rid: 1, players: mine },
    { rid: 2, players: theirs },
    { rid: 3, players: third },
  ];

  it("names where each side climbs and that a bench player costs no position", () => {
    const r = ideaReason([all.myRb2!], [all.tTe1!], 1, 2, rosters, model, NFL);
    expect(r).toEqual({
      teams: 3,
      mine: { up: { pos: "TE", from: 3, to: 1 }, cost: null },
      theirs: { up: { pos: "RB", from: 3, to: 3 }, cost: { pos: "TE", from: 1, to: 3 } },
    });
    expect(reasonText(r)).toBe(
      "You go from 3rd to 1st at TE without weakening another position; they strengthen RB (still 3rd).",
    );
  });

  it("names what a starter sent costs you", () => {
    const r = ideaReason([all.myRb1!], [all.tTe1!], 1, 2, rosters, model, NFL);
    expect(r.mine.cost).toEqual({ pos: "RB", from: 1, to: 3 });
    expect(reasonText(r)).toBe(
      "You go from 3rd to 1st at TE and drop from 1st to 3rd at RB; they go from 3rd to 1st at RB.",
    );
  });

  it("attaches a reason to every idea", () => {
    const ideas = [{ give: [all.myRb2!], get: [all.tTe1!], partner: 2 }];
    const [idea] = withReasons(ideas, 1, rosters, model, NFL);
    expect(idea!.reason.mine.up?.pos).toBe("TE");
  });

  it("works for the NBA's positions", () => {
    const nba = (rid: number, pg: number, c: number) => [
      player(`${rid}pg`, "PG", pg),
      player(`${rid}c`, "C", c),
    ];
    const teams = [
      { rid: 1, players: nba(1, 40, 20) },
      { rid: 2, players: nba(2, 25, 38) },
    ];
    const players = Object.fromEntries(teams.flatMap((t) => t.players).map((p) => [p.id, p]));
    const nbaModel = { players, repl: {}, slots: ["PG", "C"], teams: 2 } as Model;
    const r = ideaReason([players["1pg"]!], [players["2c"]!], 1, 2, teams, nbaModel, NBA);
    expect(reasonText(r)).toBe(
      "You go from 2nd to 1st at C and drop from 1st to 2nd at PG; they go from 2nd to 1st at PG.",
    );
  });
});

describe("ideaReason through flexible slots", () => {
  it("falls back to the starting lineup's rank when no position climbs", () => {
    // Guards only play in UTIL here, so the guard swap moves no position rank.
    const teams = [
      { rid: 1, players: [player("1c", "C", 30), player("1pg", "PG", 10)] },
      { rid: 2, players: [player("2c", "C", 25), player("2pg", "PG", 22), player("2c2", "C", 12)] },
    ];
    const players = Object.fromEntries(teams.flatMap((t) => t.players).map((p) => [p.id, p]));
    const nbaModel = { players, repl: {}, slots: ["C", "UTIL"], teams: 2 } as Model;
    const r = ideaReason([players["1pg"]!], [players["2pg"]!], 1, 2, teams, nbaModel, NBA);
    expect(r.mine.up).toEqual({ pos: null, from: 2, to: 1 });
    expect(reasonText(r)).toBe(
      "You go from 2nd to 1st in starting lineups without weakening another position; they add depth.",
    );
  });
});

describe("reasonText", () => {
  it("words a lineup that gains without climbing", () => {
    expect(
      reasonText({
        teams: 12,
        mine: { up: { pos: null, from: 5, to: 5 }, cost: { pos: "C", from: 2, to: 2 } },
        theirs: { up: { pos: null, from: 3, to: 3 }, cost: null },
      }),
    ).toBe(
      "You strengthen your lineup (still 5th) and stay 2nd at C; they strengthen their lineup (still 3rd).",
    );
  });

  it("says a side stays at its rank or only adds depth", () => {
    expect(
      reasonText({
        teams: 12,
        mine: { up: null, cost: { pos: "WR", from: 2, to: 2 } },
        theirs: { up: null, cost: null },
      }),
    ).toBe("You add depth and stay 2nd at WR; they add depth.");
  });

  it("says where a partner that gains nowhere gets weaker", () => {
    const mine = { up: { pos: "TE", from: 8, to: 1 }, cost: null };
    expect(
      reasonText({ teams: 12, mine, theirs: { up: null, cost: { pos: "TE", from: 1, to: 4 } } }),
    ).toBe(
      "You go from 8th to 1st at TE without weakening another position; they drop from 1st to 4th at TE.",
    );
    expect(
      reasonText({ teams: 12, mine, theirs: { up: null, cost: { pos: "TE", from: 1, to: 1 } } }),
    ).toBe(
      "You go from 8th to 1st at TE without weakening another position; they weaken TE (still 1st).",
    );
  });
});

describe("ordinal", () => {
  it("uses the right English suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
      "112th",
    ]);
  });
});
