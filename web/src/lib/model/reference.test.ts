/**
 * The TypeScript model must reproduce the prototype exactly on the demo league.
 * Reference outputs come from tests/reference/generate.mjs.
 */
import { describe, expect, it } from "vitest";
import { demoLeague, demoStats, reference } from "../../../tests/demo";
import { NFL_PROTOTYPE as NFL } from "../sports/nfl";
import {
  bestLineup,
  buildModel,
  evaluateTrade,
  rosterPlayers,
  suggestTrades,
  verdict,
  type TeamRoster,
} from ".";

const ref = reference();
const demo = demoLeague();
const model = buildModel(demoStats(), demo.league, NFL);
const rosters: TeamRoster[] = demo.rosters.map((r) => ({
  rid: r.roster_id,
  players: rosterPlayers(model, r.players),
}));
const roster = (rid: number) => rosters.find((t) => t.rid === rid)!.players;
const ids = (list: { id: string }[]) => list.map((p) => p.id);
const PRECISION = 9;

describe("model matches the prototype on the demo league", () => {
  it("uses the same slots, team count and replacement levels", () => {
    expect(model.slots).toEqual(ref.slots);
    expect(model.teams).toBe(ref.teams);
    for (const [pos, level] of Object.entries(ref.repl)) {
      expect(model.repl[pos]).toBeCloseTo(level, PRECISION);
    }
  });

  it("values every player the same way", () => {
    expect(Object.keys(model.players).sort()).toEqual(Object.keys(ref.players).sort());
    for (const [id, want] of Object.entries(ref.players)) {
      const got = model.players[id]!;
      expect(got.pos, id).toBe(want.pos);
      expect(got.g, id).toBe(want.g);
      expect(got.prevG, id).toBe(want.prevG);
      expect(got.startable, id).toBe(want.startable);
      expect(got.weekly.map((w) => w.pts)).toEqual(
        want.weekly.map((x) => (x === null ? null : expect.closeTo(x, PRECISION))),
      );
      for (const key of ["seasonAvg", "lastAvg", "prevPpg"] as const) {
        if (want[key] === null) expect(got[key], `${id} ${key}`).toBeNull();
        else expect(got[key], `${id} ${key}`).toBeCloseTo(want[key], PRECISION);
      }
      expect(got.value, id).toBeCloseTo(want.value, PRECISION);
      expect(got.vorp, id).toBeCloseTo(want.vorp, PRECISION);
      for (const [k, w] of Object.entries(want.weights)) {
        expect(got.weights[k as keyof typeof got.weights], `${id} ${k}`).toBeCloseTo(w, PRECISION);
      }
    }
  });

  it.each(ref.rosters.map((r) => [r.rid, r] as const))(
    "builds the same lineup for team %i",
    (rid, want) => {
      const lu = bestLineup(roster(rid), model.slots, NFL);
      expect(lu.slots.map((p) => (p ? p.id : null))).toEqual(want.lineup.slots);
      expect(lu.total).toBeCloseTo(want.lineup.total, PRECISION);
    },
  );

  it.each(ref.rosters.map((r) => [r.rid, r] as const))(
    "suggests the same trades for team %i",
    (rid, want) => {
      const ideas = suggestTrades(rid, rosters, model, NFL);
      expect(ideas.map((r) => [r.partner, ids(r.give), ids(r.get)])).toEqual(
        want.suggestions.map((r) => [r.partner, r.give, r.get]),
      );
      ideas.forEach((r, i) => {
        const w = want.suggestions[i]!;
        expect(r.dMe).toBeCloseTo(w.dMe, PRECISION);
        expect(r.dThem).toBeCloseTo(w.dThem, PRECISION);
        expect(r.vGive).toBeCloseTo(w.vGive, PRECISION);
        expect(r.vGet).toBeCloseTo(w.vGet, PRECISION);
        expect(r.fairness).toBeCloseTo(w.fairness, PRECISION);
        expect(r.score).toBeCloseTo(w.score, PRECISION);
        expect(verdict(r, NFL.model)).toEqual(w.verdict);
      });
    },
  );

  it.each(ref.manual.map((m, i) => [i, m] as const))(
    "evaluates manual trade %i the same way",
    (_, want) => {
      const mine = roster(want.myRid);
      const theirs = roster(want.partner);
      const pick = (list: typeof mine, wanted: string[]) =>
        wanted.map((id) => list.find((p) => p.id === id)!);
      const r = evaluateTrade(
        mine,
        theirs,
        pick(mine, want.give),
        pick(theirs, want.get),
        bestLineup(mine, model.slots, NFL).total,
        bestLineup(theirs, model.slots, NFL).total,
        model,
        NFL,
      );
      expect(r.myOpen).toBe(want.myOpen);
      expect(r.theirOpen).toBe(want.theirOpen);
      expect(r.meAfter).toBeCloseTo(want.meAfter, PRECISION);
      expect(r.themAfter).toBeCloseTo(want.themAfter, PRECISION);
      expect(r.dMe).toBeCloseTo(want.dMe, PRECISION);
      expect(r.dThem).toBeCloseTo(want.dThem, PRECISION);
      expect(r.fairness).toBeCloseTo(want.fairness, PRECISION);
      expect(verdict(r, NFL.model)).toEqual(want.verdict);
    },
  );
});
