import { describe, expect, it } from "vitest";
import { leagueTrade } from "./useLeagueTrades";

describe("leagueTrade", () => {
  it("splits a Sleeper trade into what each team received", () => {
    expect(
      leagueTrade({
        transaction_id: "77",
        leg: 4,
        created: 5,
        roster_ids: [1, 2],
        adds: { "10": 2, "11": 1, "12": 1 },
        draft_picks: [{ season: "2027", round: 2, owner_id: 1 }],
        waiver_budget: [{ receiver: 2, amount: 10 }],
      }),
    ).toEqual({
      id: "77",
      week: 4,
      created: 5,
      sides: [
        { rid: 1, players: ["11", "12"], picks: ["2027 round 2"], faab: 0 },
        { rid: 2, players: ["10"], picks: [], faab: 10 },
      ],
    });
  });
});
