/*
 * Generates reference outputs from the original prototype (docs/app.js at the
 * commit below) using the fictional demo league. The TypeScript model is
 * tested against these outputs, so the port keeps the prototype's behavior.
 *
 *   node tests/reference/generate.mjs
 *
 * The prototype runs inside a Node `vm` with a minimal fake DOM: only its pure
 * model functions (buildModel, lineup, evaluate, suggestTrades, verdict) are
 * called; nothing is rendered.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const PROTOTYPE_COMMIT = "30a6ad7";
const here = dirname(fileURLToPath(import.meta.url));

const fromGit = (path) =>
  execFileSync("git", ["show", `${PROTOTYPE_COMMIT}:${path}`], { cwd: here, encoding: "utf8" });

const appJs = fromGit("docs/app.js");
const stats = JSON.parse(fromGit("docs/data/demo_stats.json"));
const demo = JSON.parse(fromGit("docs/data/demo_league.json"));

// Any property read or call on a fake element returns another fake element.
const fakeElement = () =>
  new Proxy(function () {}, {
    get: (_, key) => (key === "querySelectorAll" ? () => [] : fakeElement()),
    set: () => true,
    apply: () => fakeElement(),
  });

const context = vm.createContext({
  document: { querySelector: () => fakeElement(), createElement: () => fakeElement() },
  location: { search: "", hostname: "localhost", pathname: "/" },
  history: { replaceState() {} },
  localStorage: {
    getItem: () => null,
    setItem() {},
  },
  matchMedia: () => ({ matches: false }),
  fetch: () => Promise.reject(new Error("no network in reference generation")),
  console,
  URLSearchParams,
  window: {},
});
vm.runInContext(appJs, context, { filename: "app.js" });

const run = (code) => vm.runInContext(code, context);
context.__stats = stats;
context.__demo = demo;
run(`
  S.stats = __stats;
  S.league = __demo.league;
  const names = {};
  for (const u of __demo.users) names[u.user_id] = u.metadata.team_name;
  S.teams = __demo.rosters.map(r => ({
    rid: Number(r.roster_id), owner: r.owner_id, co: [],
    name: names[r.owner_id], players: r.players.map(String), record: "",
  }));
  S.model = buildModel(__stats, __demo.league);
`);

const ids = (list) => list.map((p) => p.id);
const model = run("S.model");

const players = Object.fromEntries(
  Object.values(model.P)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => [
      p.id,
      {
        pos: p.pos,
        g: p.g,
        seasonAvg: p.seasonAvg,
        lastAvg: p.lastAvg,
        prevG: p.prevG,
        prevPpg: p.prevPpg,
        weekly: p.weekly.map((w) => w.pts),
        value: p.value,
        vorp: p.vorp,
        startable: p.startable,
        weights: p.weights,
      },
    ]),
);

const teams = run("S.teams").map((t) => {
  const lu = run(`lineup(teamPlayers(${t.rid}), S.model.slots)`);
  const suggestions = run(`suggestTrades(${t.rid})`).map((r) => ({
    partner: r.partner,
    give: ids(r.give),
    get: ids(r.get),
    dMe: r.dMe,
    dThem: r.dThem,
    vGive: r.vGive,
    vGet: r.vGet,
    fairness: r.fairness,
    score: r.score,
    verdict: run("verdict")(r),
  }));
  return {
    rid: t.rid,
    lineup: { slots: lu.slots.map((p) => (p ? p.id : null)), total: lu.total },
    suggestions,
  };
});

// Hand-built uneven trades exercise the free-agent fill on both sides.
const myRid = demo.my_roster_id;
const manual = [
  { partner: 1, give: 2, get: 1 },
  { partner: 4, give: 1, get: 2 },
  { partner: 7, give: 2, get: 2 },
].map(({ partner, give, get }) => {
  context.__args = { myRid, partner, give, get };
  const r = run(`(() => {
    const { myRid, partner, give, get } = __args;
    const mine = teamPlayers(myRid), theirs = teamPlayers(partner);
    const byValue = l => [...l].sort((a, b) => b.value - a.value);
    const g = byValue(mine).slice(1, 1 + give), t = byValue(theirs).slice(0, get);
    return evaluate(mine, theirs, g, t,
      lineup(mine, S.model.slots).total, lineup(theirs, S.model.slots).total);
  })()`);
  return {
    myRid,
    partner,
    give: ids(r.give),
    get: ids(r.get),
    myOpen: r.myOpen,
    theirOpen: r.theirOpen,
    meAfter: r.meAfter,
    themAfter: r.themAfter,
    dMe: r.dMe,
    dThem: r.dThem,
    fairness: r.fairness,
    verdict: run("verdict")(r),
  };
});

const out = {
  source: `prototype docs/app.js @ ${PROTOTYPE_COMMIT}, demo league`,
  slots: model.slots,
  teams: model.teams,
  repl: model.repl,
  players,
  rosters: teams,
  manual,
};
const file = join(here, "demo-reference.json");
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(
  `Wrote ${file}: ${Object.keys(players).length} players, ${teams.length} teams, ` +
    `${teams.reduce((n, t) => n + t.suggestions.length, 0)} suggestions, ${manual.length} manual trades`,
);
