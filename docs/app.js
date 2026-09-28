/*
 * Trade Huddle
 * Everything league-specific runs here, in the browser:
 *   1. Load the weekly stats file (data/stats.json, built by build_data.py).
 *   2. Load the league, rosters and users from Sleeper's public API.
 *   3. Score every game with the league's own scoring rules.
 *   4. Value players, build lineups, search for trades.
 *
 * Security notes:
 *   - All text that comes from Sleeper (team names, league names, player names)
 *     goes through esc() before it touches innerHTML.
 *   - IDs read from the URL or typed by the user are validated before they are
 *     used to build API URLs.
 *   - No keys or secrets exist anywhere in this code: Sleeper's API is public.
 */
"use strict";

/* ==========================================================
   MODEL SETTINGS (tweak freely)
   ========================================================== */
const CFG = {
  // Weight of last season: starts at 60% and drops 8 points per game played
  // this season, down to a 10% floor.
  W_PREV_START: 0.60,
  W_PREV_DECAY: 0.08,
  W_PREV_MIN: 0.10,
  // Last season only gets full weight with at least 4 games played.
  PREV_FULL_GAMES: 4,
  // Of the current-season weight, the share that goes to the latest games.
  RECENT_SHARE: 0.55,
  RECENT_GAMES: 3,
  // Players with no history are pulled toward replacement level (worth 1 game).
  SHRINK_GAMES: 1,
  // Injuries: [value multiplier, can be started].
  INJURY: {
    IR: [0.5, false], PUP: [0.5, false], Sus: [0.5, false], NA: [0.5, false],
    Out: [0.9, true], Doubtful: [0.95, true],
  },
  // Trade idea filters.
  MIN_GAIN_ME: 0.3,     // your starters must gain at least this (pts/game)
  MIN_GAIN_THEM: 0.1,   // the partner's starters must gain too
  MIN_FAIRNESS: 0.75,   // smaller side's value / larger side's value (at most "slightly favors")
  CANDIDATES: 10,       // players per roster considered in the search
};

const SUPPORTED = ["QB", "RB", "WR", "TE", "K", "DEF"];
const SLOT_ELIG = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"], WRRB_FLEX: ["WR", "RB"], REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
};
const SLOT_LABEL = { FLEX: "FLEX", WRRB_FLEX: "W/R", REC_FLEX: "W/T", SUPER_FLEX: "SFLEX" };
const IDP_SLOTS = ["DL", "LB", "DB", "IDP_FLEX"];
const API = "https://api.sleeper.app/v1";
const LOCALE = "en-US";

/* ========================================================== helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (x, d = 1) => (x == null || !isFinite(x)) ? "–" : x.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (x, d = 1) => {
  if (x == null || !isFinite(x)) return "–";
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + fmt(Math.abs(r), d);
};
const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const pct = x => Math.round(x * 100) + "%";
const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

// Sleeper IDs are numeric strings; usernames are short and simple.
const isLeagueId = s => /^\d{5,25}$/.test(String(s || ""));
const isUsername = s => /^[A-Za-z0-9_.\-]{2,40}$/.test(String(s || ""));

const store = {
  get(k) { try { return localStorage.getItem("th:" + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("th:" + k, v); } catch { /* storage unavailable */ } },
};

class UserError extends Error { }

async function api(path) {
  let r;
  try {
    r = await fetch(API + path, { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw new UserError("Could not reach Sleeper. Check your connection and try again.");
  }
  if (!r.ok) throw new UserError(`Sleeper returned an error (${r.status}). Try again in a minute.`);
  return r.json();
}

const statsCache = {};
async function loadStats(demo) {
  if (demo && window.__EMBED__) return window.__EMBED__.stats;
  const file = demo ? "data/demo_stats.json" : "data/stats.json";
  if (statsCache[file]) return statsCache[file];
  const r = await fetch(file, { cache: "no-cache" });
  if (!r.ok) throw new UserError("The stats file has not been built yet. Run build_data.py, or wait for the Tuesday update.");
  return (statsCache[file] = await r.json());
}

/* ========================================================== model */
function slotsOf(league) {
  return (league.roster_positions || []).filter(s => SLOT_ELIG[s]);
}

function buildModel(stats, league) {
  const sc = league.scoring_settings || {};
  const weights = stats.keys.map(k => typeof sc[k] === "number" ? sc[k] : 0);
  const score = packed => {
    let s = 0;
    if (!packed) return 0;
    for (let i = 0; i < packed.length; i += 2) s += weights[packed[i]] * packed[i + 1];
    return s;
  };

  const P = {};
  for (const [id, p] of Object.entries(stats.players)) {
    const elig = (p.fp && p.fp.length ? p.fp : [p.p]).filter(x => SUPPORTED.includes(x));
    const pos = SUPPORTED.includes(p.p) ? p.p : elig[0];
    if (!pos) continue;
    const weekly = stats.weeks.map(wk => ({ w: wk, pts: p.w && p.w[wk] ? score(p.w[wk]) : null }));
    const played = weekly.filter(x => x.pts != null).map(x => x.pts);
    const prevG = p.prev ? p.prev.g : 0;
    P[id] = {
      id, name: p.n || `Player ${id}`, pos, elig: elig.length ? elig : [pos], team: p.t || "",
      age: p.a, inj: p.i || null, status: p.s || null,
      weekly, g: played.length,
      seasonAvg: avg(played),
      lastAvg: avg(played.slice(-CFG.RECENT_GAMES)),
      prevG, prevPpg: prevG ? score(p.prev.s) / prevG : null,
    };
  }
  const list = Object.values(P);
  const slots = slotsOf(league);
  const teams = league.total_rosters || (league.settings && league.settings.num_teams) || 12;

  // Two passes: replacement level depends on values, and rookies' values
  // depend on replacement level.
  list.forEach(pl => estimate(pl, null));
  let repl = replacement(list, slots, teams);
  list.forEach(pl => estimate(pl, repl));
  repl = replacement(list, slots, teams);
  list.forEach(pl => { pl.vorp = Math.max(0, pl.value - (repl[pl.pos] || 0)); });
  return { P, repl, slots, teams };
}

/* Expected points per game from here on: last season + this season + recent form. */
function estimate(pl, repl) {
  let wPrev = 0, wSeason = 0, wRecent = 0, base = 0;
  const hasPrev = pl.prevG > 0;
  if (pl.g === 0) {
    if (hasPrev) { base = pl.prevPpg; wPrev = 1; }
  } else {
    if (hasPrev) {
      wPrev = Math.max(CFG.W_PREV_MIN, CFG.W_PREV_START - CFG.W_PREV_DECAY * pl.g)
        * Math.min(1, pl.prevG / CFG.PREV_FULL_GAMES);
    }
    const rest = 1 - wPrev;
    wRecent = rest * CFG.RECENT_SHARE;
    wSeason = rest - wRecent;
    base = wPrev * (hasPrev ? pl.prevPpg : 0) + wSeason * pl.seasonAvg + wRecent * pl.lastAvg;
  }
  // Small sample and no track record: pull toward replacement level.
  let wRepl = 0;
  if (repl && pl.prevG < CFG.PREV_FULL_GAMES) {
    const missing = 1 - pl.prevG / CFG.PREV_FULL_GAMES;
    wRepl = (CFG.SHRINK_GAMES * missing) / (CFG.SHRINK_GAMES * missing + pl.g + pl.prevG) || 0;
    if (pl.g === 0 && !hasPrev) wRepl = 1;
  }
  const replVal = repl ? (repl[pl.pos] || 0) : 0;
  const raw = (1 - wRepl) * base + wRepl * replVal;
  const [mult, startable] = CFG.INJURY[pl.inj] || [1, true];
  pl.value = Math.max(0, raw * mult);
  pl.startable = startable;
  pl.injMult = mult;
  const k = 1 - wRepl;
  pl.weights = { prev: wPrev * k, season: wSeason * k, recent: wRecent * k, repl: wRepl };
}

/* Replacement level: the best players left over after every team fills its starting slots. */
function replacement(list, slots, teams) {
  const byPos = {};
  for (const pl of list) (byPos[pl.pos] ||= []).push(pl);
  for (const k in byPos) byPos[k].sort((a, b) => b.value - a.value);
  const counts = {};
  for (const s of slots) counts[s] = (counts[s] || 0) + 1;
  const order = Object.keys(counts).sort((a, b) => SLOT_ELIG[a].length - SLOT_ELIG[b].length);
  const sorted = [...list].sort((a, b) => b.value - a.value);
  const taken = new Set();
  for (const s of order) {
    let need = counts[s] * teams;
    const el = SLOT_ELIG[s];
    for (const pl of sorted) {
      if (!need) break;
      if (!taken.has(pl.id) && pl.startable && pl.elig.some(e => el.includes(e))) { taken.add(pl.id); need--; }
    }
  }
  const repl = {};
  for (const pos of SUPPORTED) {
    const rest = (byPos[pos] || []).filter(pl => !taken.has(pl.id) && pl.startable).slice(0, 3).map(pl => pl.value);
    repl[pos] = rest.length ? avg(rest) : 0;
  }
  return repl;
}

/* Best lineup: fixed slots first, then flex slots from most to least restrictive. */
function lineup(players, slots) {
  const avail = players.filter(p => p.startable && p.value > 0).sort((a, b) => b.value - a.value);
  const order = slots.map((s, i) => ({ s, i })).sort((a, b) => SLOT_ELIG[a.s].length - SLOT_ELIG[b.s].length);
  const used = new Set();
  const res = new Array(slots.length).fill(null);
  let total = 0;
  for (const { s, i } of order) {
    const el = SLOT_ELIG[s];
    const p = avail.find(p => !used.has(p.id) && p.elig.some(e => el.includes(e)));
    if (p) { used.add(p.id); res[i] = p; total += p.value; }
  }
  return { slots: res, total, used };
}

/* ========================================================== trades */
function freeAgent(pos) {
  return {
    id: "fa-" + pos, name: `Free agent (${pos})`, pos, elig: [pos],
    value: S.model.repl[pos] || 0, vorp: 0, startable: true, freeAgent: true,
  };
}

/* A team that sends more players than it gets fills the open spots from free agency. */
function withFreeAgents(list, open) {
  let l = list;
  for (let n = 0; n < open; n++) {
    let best = null, bestTotal = -1;
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const cand = l.concat(freeAgent(pos));
      const t = lineup(cand, S.model.slots).total;
      if (t > bestTotal) { bestTotal = t; best = cand; }
    }
    l = best;
  }
  return l;
}

function evaluate(myList, theirList, give, get, myBase, theirBase) {
  const giveIds = new Set(give.map(p => p.id)), getIds = new Set(get.map(p => p.id));
  let mine = myList.filter(p => !giveIds.has(p.id)).concat(get);
  let theirs = theirList.filter(p => !getIds.has(p.id)).concat(give);
  const myOpen = Math.max(0, give.length - get.length);
  const theirOpen = Math.max(0, get.length - give.length);
  if (myOpen) mine = withFreeAgents(mine, myOpen);
  if (theirOpen) theirs = withFreeAgents(theirs, theirOpen);
  const meAfter = lineup(mine, S.model.slots).total;
  const themAfter = lineup(theirs, S.model.slots).total;
  const vGive = give.reduce((s, p) => s + p.vorp, 0);
  const vGet = get.reduce((s, p) => s + p.vorp, 0);
  const hi = Math.max(vGive, vGet), lo = Math.min(vGive, vGet);
  return {
    give, get, myOpen, theirOpen,
    meBefore: myBase, meAfter, dMe: meAfter - myBase,
    themBefore: theirBase, themAfter, dThem: themAfter - theirBase,
    vGive, vGet, fairness: hi > 0 ? lo / hi : 1,
  };
}

function combos(list) {
  const out = list.map(p => [p]);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  return out;
}

function candidates(list) {
  return list.filter(p => p.vorp > 0.05).sort((a, b) => b.vorp - a.vorp).slice(0, CFG.CANDIDATES);
}

/* Tries every 1-for-1, 2-for-1, 1-for-2 and 2-for-2 deal with every team. */
function suggestTrades(myRid) {
  const mine = teamPlayers(myRid);
  const myBase = lineup(mine, S.model.slots).total;
  const myCands = combos(candidates(mine));
  const found = [];
  for (const t of S.teams) {
    if (t.rid === myRid) continue;
    const theirs = teamPlayers(t.rid);
    const theirBase = lineup(theirs, S.model.slots).total;
    const theirCands = combos(candidates(theirs));
    for (const give of myCands) for (const get of theirCands) {
      const r = evaluate(mine, theirs, give, get, myBase, theirBase);
      if (r.dMe < CFG.MIN_GAIN_ME || r.dThem < CFG.MIN_GAIN_THEM || r.fairness < CFG.MIN_FAIRNESS) continue;
      r.partner = t.rid;
      // Favor your gain, reward the partner's gain, prefer simpler deals.
      r.score = r.dMe + 0.6 * r.dThem - 0.15 * (give.length + get.length - 2);
      found.push(r);
    }
  }
  found.sort((a, b) => b.score - a.score);

  const picked = [];
  const usedMine = new Set();
  const usedPartner = new Set();
  // First pass: different partners, never offering the same player twice.
  for (const r of found) {
    if (picked.length >= 3) break;
    if (usedPartner.has(r.partner) || r.give.some(p => usedMine.has(p.id))) continue;
    picked.push(r); usedPartner.add(r.partner); r.give.forEach(p => usedMine.add(p.id));
  }
  // Second pass: fill any remaining spots, still without repeating your players.
  for (const r of found) {
    if (picked.length >= 3) break;
    if (picked.includes(r) || r.give.some(p => usedMine.has(p.id))) continue;
    picked.push(r); r.give.forEach(p => usedMine.add(p.id));
  }
  return picked;
}

function verdict(r) {
  if (r.vGive + r.vGet <= 0) return { cls: "fair", text: "Balanced" };
  const diff = (r.vGet - r.vGive) / Math.max(r.vGive, r.vGet);
  const a = Math.abs(diff);
  const who = diff > 0 ? "you" : "them";
  if (a <= 0.10) return { cls: "fair", text: "Balanced" };
  if (a <= 0.25) return { cls: "lean", text: `Slightly favors ${who}` };
  return { cls: "skew", text: `Clearly favors ${who}` };
}

/* ========================================================== state */
const S = {
  stats: null, league: null, teams: [], model: null, suggestions: [],
  myRid: null, partnerRid: null, give: new Set(), get: new Set(), demo: false, sparkMax: 30,
};

function teamPlayers(rid) {
  const t = S.teams.find(t => t.rid === rid);
  return t ? t.players.map(id => S.model.P[id]).filter(Boolean) : [];
}
function teamName(rid) {
  const t = S.teams.find(t => t.rid === rid);
  return t ? t.name : "?";
}

/* ========================================================== screens */
function show(which) {
  $("#entry").hidden = which !== "entry";
  $("#app").hidden = which !== "app";
  $("#loading").hidden = which !== "loading";
}

function friendly(ex) {
  if (ex instanceof UserError) return ex.message;
  console.error(ex);
  return "Something went wrong while loading the data. Try again in a minute.";
}

function showEntry(message) {
  show("entry");
  const err = $("#entry-error");
  err.hidden = !message;
  err.textContent = message || "";
  const u = store.get("user");
  if (u && !$("#username").value) $("#username").value = u;
  if (window.__EMBED__) {
    $("#user-form").hidden = true;
    $("#entry-hint").textContent = "This preview only includes the demo league. ";
    const b = document.createElement("button");
    b.className = "btn link"; b.type = "button"; b.textContent = "Open the demo";
    b.onclick = startDemo;
    $("#entry-hint").append(b);
  }
}

$("#user-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("#username").value.trim();
  const list = $("#league-list");
  const err = $("#entry-error");
  err.hidden = true;
  list.textContent = "";
  if (!isUsername(name)) {
    err.hidden = false;
    err.textContent = "Enter a valid Sleeper username (letters, numbers, dots, dashes or underscores).";
    return;
  }
  const btn = $("#user-submit");
  btn.disabled = true; btn.textContent = "Searching…";
  try {
    const user = await api(`/user/${encodeURIComponent(name)}`);
    if (!user || !user.user_id) throw new UserError(`No Sleeper user named "${name}". Check the spelling: it is your profile username, not your team name.`);
    store.set("user", name);
    store.set("uid", String(user.user_id));
    const state = await api("/state/nfl");
    const season = String(state.league_season || state.season);
    if (!/^\d{4}$/.test(season)) throw new UserError("Sleeper returned an unexpected season.");
    const leagues = await api(`/user/${encodeURIComponent(user.user_id)}/leagues/nfl/${season}`);
    if (!leagues || !leagues.length) throw new UserError(`${user.display_name || name} has no NFL leagues in ${season}.`);
    list.innerHTML = leagues.filter(l => isLeagueId(l.league_id)).map(l =>
      `<li><button class="btn" type="button" data-id="${esc(l.league_id)}"><span>${esc(l.name)}</span><span class="muted">${esc(l.total_rosters)} teams</span></button></li>`
    ).join("");
    list.querySelectorAll("button").forEach(b => b.onclick = () => openLeague(b.dataset.id));
    if (leagues.length === 1) openLeague(leagues[0].league_id);
  } catch (ex) {
    err.hidden = false;
    err.textContent = friendly(ex);
  } finally {
    btn.disabled = false; btn.textContent = "Find my leagues";
  }
});
$("#demo-btn").onclick = startDemo;
$("#change-league").onclick = () => {
  history.replaceState(null, "", location.pathname);
  store.set("league", "");
  $("#league-list").textContent = "";
  showEntry();
};

async function openLeague(id, teamHint) {
  if (!isLeagueId(id)) return showEntry("That league link is not valid.");
  show("loading");
  try {
    const [stats, league, rosters, users] = await Promise.all([
      loadStats(false), api(`/league/${id}`), api(`/league/${id}/rosters`), api(`/league/${id}/users`),
    ]);
    if (!league || !league.league_id) throw new UserError("League not found.");
    S.demo = false;
    store.set("league", id);
    setup(stats, league, rosters, users, teamHint);
  } catch (ex) {
    showEntry(friendly(ex));
  }
}

async function startDemo() {
  show("loading");
  try {
    const stats = await loadStats(true);
    const d = window.__EMBED__ ? window.__EMBED__.league : await (await fetch("data/demo_league.json")).json();
    S.demo = true;
    setup(stats, d.league, d.rosters, d.users, String(d.my_roster_id));
  } catch (ex) {
    showEntry("Could not open the demo. " + friendly(ex));
  }
}

function setup(stats, league, rosters, users, teamHint) {
  S.stats = stats;
  S.league = league;
  const names = {};
  for (const u of users || []) names[u.user_id] = (u.metadata && u.metadata.team_name) || u.display_name || u.username;
  S.teams = (rosters || []).map(r => ({
    rid: Number(r.roster_id),
    owner: r.owner_id,
    co: r.co_owners || [],
    name: names[r.owner_id] || `Team ${r.roster_id}`,
    players: (r.players || []).map(String),
    record: r.settings ? `${Number(r.settings.wins) || 0}-${Number(r.settings.losses) || 0}${r.settings.ties ? "-" + Number(r.settings.ties) : ""}` : "",
  }));
  S.model = buildModel(stats, league);

  // Shared scale for the weekly mini charts: the best week by any rostered player.
  let mx = 10;
  for (const t of S.teams) for (const p of teamPlayers(t.rid)) for (const w of p.weekly) if (w.pts > mx) mx = w.pts;
  S.sparkMax = mx;

  const uid = store.get("uid");
  let rid = teamHint != null && S.teams.some(t => String(t.rid) === String(teamHint)) ? Number(teamHint) : null;
  if (rid == null && uid) {
    const t = S.teams.find(t => t.owner === uid || t.co.includes(uid));
    if (t) rid = t.rid;
  }
  if (rid == null) rid = S.teams[0] && S.teams[0].rid;
  S.myRid = rid;
  S.partnerRid = null;

  const sel = $("#team-select");
  sel.innerHTML = [...S.teams].sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.rid}">${esc(t.name)}</option>`).join("");
  sel.value = String(rid);
  sel.onchange = () => {
    S.myRid = Number(sel.value);
    if (!S.demo) store.set("team:" + league.league_id, sel.value);
    S.partnerRid = null;
    renderAll();
  };

  if (!S.demo) history.replaceState(null, "", "?league=" + encodeURIComponent(league.league_id));

  $("#league-name").textContent = league.name + (S.demo ? " (fictional data)" : "");
  const updated = new Date(stats.generated_at);
  const wk = stats.weeks.length
    ? `weeks ${stats.weeks[0]}–${stats.weeks[stats.weeks.length - 1]} of ${stats.season}`
    : `no ${stats.season} games yet`;
  $("#league-meta").textContent = `${S.teams.length} teams · ${wk} · stats updated ${updated.toLocaleDateString(LOCALE, { month: "short", day: "numeric" })}`;

  const banners = [];
  if (S.demo) banners.push("<b>Demo league.</b> Players, teams and numbers are fictional. To use your own league, click Change league and enter your Sleeper username.");
  if (league.settings && league.settings.type === 2) banners.push("<b>Dynasty league.</b> Values here only consider this season (redraft logic). Age, future outlook and draft picks are not included.");
  if ((league.roster_positions || []).some(s => IDP_SLOTS.includes(s))) banners.push("<b>IDP slots.</b> Individual defensive players are not valued yet, so IDP slots are left out of the lineup.");
  $("#banners").innerHTML = banners.map(b => `<div class="banner" role="note"><span>${b}</span></div>`).join("");

  renderMethod();
  show("app");
  renderAll();
}

function renderAll() {
  S.suggestions = suggestTrades(S.myRid);
  renderTeam(teamPlayers(S.myRid));
  renderSuggestions();
  if (!S.partnerRid || S.partnerRid === S.myRid) {
    S.partnerRid = S.suggestions[0] ? S.suggestions[0].partner : (S.teams.find(t => t.rid !== S.myRid) || {}).rid;
    S.give = new Set();
    S.get = new Set();
  }
  renderAnalyzer();
}

/* ---------------------------------------------------------- small pieces */
function spark(p) {
  const bw = 6, gap = 2, h = 22;
  const n = p.weekly.length;
  if (!n) return "";
  const W = n * (bw + gap) - gap;
  const y = v => h - Math.max(1.5, (Math.max(0, v) / S.sparkMax) * h);
  let out = `<svg class="spark" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="Points by week for ${esc(p.name)}">`;
  p.weekly.forEach((wk, i) => {
    const x = i * (bw + gap);
    if (wk.pts == null) {
      out += `<rect x="${x + bw / 2 - 1}" y="${h - 2}" width="2" height="2" rx="1" class="miss"><title>Week ${wk.w}: did not play</title></rect>`;
    } else {
      const yy = y(wk.pts);
      out += `<rect x="${x}" y="${yy}" width="${bw}" height="${h - yy}" rx="1.5" class="hit"><title>Week ${wk.w}: ${fmt(wk.pts)} pts</title></rect>`;
    }
  });
  return out + "</svg>";
}

function injBadge(p) {
  if (!p.inj) return "";
  const hard = (CFG.INJURY[p.inj] && !CFG.INJURY[p.inj][1]) || p.inj === "Out";
  return `<span class="inj${hard ? "" : " soft"}">${esc(p.inj)}</span>`;
}

/* Recent form, colored when it differs from last season by more than 1 pt/game. */
function formCell(p) {
  if (p.lastAvg == null) return `<span class="muted">–</span>`;
  const d = p.prevPpg != null ? p.lastAvg - p.prevPpg : null;
  const cls = d == null ? "" : d > 1 ? "trend-up" : d < -1 ? "trend-down" : "";
  return `<span class="${cls}">${fmt(p.lastAvg)}</span>`;
}

function playerCell(p) {
  return `<div class="pname">${esc(p.name)} ${injBadge(p)}</div>
    <div class="psub"><span class="pos ${esc(p.pos)}">${esc(p.pos)}</span>${esc(p.team || "No team")}</div>`;
}

/* ---------------------------------------------------------- your team */
function renderTeam(list) {
  const lu = lineup(list, S.model.slots);
  const totals = S.teams
    .map(t => ({ rid: t.rid, total: lineup(teamPlayers(t.rid), S.model.slots).total }))
    .sort((a, b) => b.total - a.total);
  const rank = totals.findIndex(t => t.rid === S.myRid) + 1;
  const bench = list.filter(p => !lu.used.has(p.id)).sort((a, b) => b.value - a.value);
  const reserve = bench.filter(p => !p.startable);
  const benchOk = bench.filter(p => p.startable);
  const team = S.teams.find(t => t.rid === S.myRid) || { players: [] };
  const unknown = team.players.filter(id => !S.model.P[id]).length;

  const head = `<thead><tr><th scope="col">Slot</th><th scope="col">Player</th>
    <th scope="col" class="num" title="Expected points per game">Value</th>
    <th scope="col" class="num" title="Average of the last ${CFG.RECENT_GAMES} games">Last ${CFG.RECENT_GAMES}</th>
    <th scope="col">Weeks</th></tr></thead>`;
  const row = (slot, p) => p
    ? `<tr><td class="slot">${esc(slot)}</td><td>${playerCell(p)}</td>
        <td class="num val">${fmt(p.value)}</td><td class="num">${formCell(p)}</td><td>${spark(p)}</td></tr>`
    : `<tr><td class="slot">${esc(slot)}</td><td class="empty-slot" colspan="4">No eligible player</td></tr>`;

  let body = S.model.slots.map((s, i) => row(SLOT_LABEL[s] || s, lu.slots[i])).join("");
  if (benchOk.length) body += `<tr class="group"><td colspan="5">Bench</td></tr>` + benchOk.map(p => row("BN", p)).join("");
  if (reserve.length) body += `<tr class="group"><td colspan="5">Injured reserve</td></tr>` + reserve.map(p => row("IR", p)).join("");

  $("#team").innerHTML = `
    <div class="strength">
      <span class="big">${fmt(lu.total)}</span>
      <span class="unit">expected pts per game from your starters</span>
      <span class="unit"><b>${ordinal(rank)}</b> of ${S.teams.length} in the league</span>
    </div>
    <div class="tbl-wrap"><table>${head}<tbody>${body}</tbody></table></div>
    ${unknown ? `<p class="hint">${unknown} rostered player(s) are hidden because their position is not valued (for example, IDP).</p>` : ""}`;
}

/* ---------------------------------------------------------- trade ideas */
function balanceBlock(r) {
  const tot = r.vGive + r.vGet || 1;
  const g = Math.max(2, (r.vGive / tot) * 100);
  const t = Math.max(2, (r.vGet / tot) * 100);
  const v = verdict(r);
  return `<div class="balance">
    <div class="balance-row"><span>You send <b>${fmt(r.vGive)}</b></span><span class="verdict ${v.cls}">${v.text}</span><span>You get <b>${fmt(r.vGet)}</b></span></div>
    <div class="balance-bar" role="img" aria-label="Value sent ${fmt(r.vGive)} versus value received ${fmt(r.vGet)}">
      <span class="give" style="flex:${g.toFixed(2)}"></span><span class="get" style="flex:${t.toFixed(2)}"></span>
    </div>
  </div>`;
}

function impactChip(label, d) {
  const cls = d > 0.05 ? "good" : d < -0.05 ? "bad" : "";
  return `<span class="chip ${cls}">${label} <b>${signed(d)}</b></span>`;
}

function tradeList(players) {
  return `<ul>${players.map(p =>
    `<li><span><span class="pos ${esc(p.pos)}">${esc(p.pos)}</span> ${esc(p.name)}</span><span class="muted">${fmt(p.value)}</span></li>`
  ).join("")}</ul>`;
}

function rosterNotes(r, partnerName) {
  const notes = [];
  if (r.myOpen) notes.push(`You open ${r.myOpen} roster spot(s); the numbers assume you add the best available free agent.`);
  if (r.theirOpen) notes.push(`You get more players than you send, so you'll need to drop ${r.theirOpen}. ${partnerName} opens ${r.theirOpen} spot(s) for a free agent.`);
  return notes;
}

function renderSuggestions() {
  const box = $("#suggestions");
  if (!S.suggestions.length) {
    box.innerHTML = `<div class="card"><p class="m0"><b>No trade improves both teams right now.</b></p>
      <p class="muted mt6">This happens when rosters don't complement each other, or when your starters are already the best options available. Build an offer in the analyzer below, or check back after the next round of games.</p></div>`;
    return;
  }
  box.innerHTML = S.suggestions.map((r, i) => {
    const t = S.teams.find(t => t.rid === r.partner);
    const notes = rosterNotes(r, esc(t.name));
    return `<article class="card">
      <div class="card-head"><h3>With ${esc(t.name)}</h3><span class="rank-tag">Idea ${i + 1}${t.record ? " · " + esc(t.record) : ""}</span></div>
      <div class="swap">
        <div><span class="label">You send</span>${tradeList(r.give)}</div>
        <div><span class="label">You get</span>${tradeList(r.get)}</div>
      </div>
      <div class="impacts">
        ${impactChip("Your starters", r.dMe)}
        ${impactChip("Their starters", r.dThem)}
        <span class="muted unit-note">pts per game</span>
      </div>
      ${balanceBlock(r)}
      ${notes.length ? `<p class="hint">${notes.join(" ")}</p>` : ""}
      <div class="card-foot"><span></span><button class="btn" type="button" data-idea="${i}">Open in analyzer</button></div>
    </article>`;
  }).join("");
  box.querySelectorAll("[data-idea]").forEach(b => b.onclick = () => {
    const r = S.suggestions[Number(b.dataset.idea)];
    S.partnerRid = r.partner;
    S.give = new Set(r.give.map(p => p.id));
    S.get = new Set(r.get.map(p => p.id));
    renderAnalyzer();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("#analyzer").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
}

/* ---------------------------------------------------------- analyzer */
function renderAnalyzer() {
  const sel = $("#partner-select");
  sel.innerHTML = S.teams.filter(t => t.rid !== S.myRid).sort((a, b) => a.name.localeCompare(b.name))
    .map(t => `<option value="${t.rid}">${esc(t.name)}</option>`).join("");
  sel.value = String(S.partnerRid);
  sel.onchange = () => { S.partnerRid = Number(sel.value); S.get = new Set(); renderAnalyzer(); };

  const pickList = (el, list, set) => {
    el.innerHTML = [...list].sort((a, b) => b.value - a.value).map(p => `
      <label class="pick${set.has(p.id) ? " on" : ""}">
        <input type="checkbox" value="${esc(p.id)}"${set.has(p.id) ? " checked" : ""}>
        <span>${playerCell(p)}</span>
        <span class="num val">${fmt(p.value)}</span>
      </label>`).join("") || `<p class="muted pad">Empty roster.</p>`;
    el.querySelectorAll("input").forEach(inp => inp.onchange = () => {
      if (inp.checked) set.add(inp.value); else set.delete(inp.value);
      inp.closest(".pick").classList.toggle("on", inp.checked);
      renderResult();
    });
  };
  pickList($("#give-list"), teamPlayers(S.myRid), S.give);
  pickList($("#get-list"), teamPlayers(S.partnerRid), S.get);
  renderResult();
}

function weightText(p) {
  const w = p.weights, parts = [];
  if (w.prev > 0.005) parts.push(`${pct(w.prev)} ${S.stats.prev_season}`);
  if (w.season > 0.005) parts.push(`${pct(w.season)} season`);
  if (w.recent > 0.005) parts.push(`${pct(w.recent)} last ${CFG.RECENT_GAMES}`);
  if (w.repl > 0.005) parts.push(`${pct(w.repl)} replacement`);
  return parts.join(" · ");
}

function renderResult() {
  const out = $("#an-result");
  const mine = teamPlayers(S.myRid), theirs = teamPlayers(S.partnerRid);
  const give = mine.filter(p => S.give.has(p.id)), get = theirs.filter(p => S.get.has(p.id));
  if (!give.length && !get.length) {
    out.innerHTML = `<p class="muted">Pick at least one player on each side, or open one of the trade ideas above.</p>`;
    return;
  }
  const myBase = lineup(mine, S.model.slots).total;
  const theirBase = lineup(theirs, S.model.slots).total;
  const r = evaluate(mine, theirs, give, get, myBase, theirBase);
  const pname = esc(teamName(S.partnerRid));
  const tone = d => d > 0.05 ? "trend-up" : d < -0.05 ? "trend-down" : "";
  const read = r.dMe > 0.05 && r.dThem > 0.05
    ? "Both teams improve, so this has a good chance of being accepted."
    : r.dThem <= 0.05 ? `${pname}'s starters don't improve, so this will be a hard sell.`
      : "Your starters don't improve with this deal.";

  const rows = [...give.map(p => ({ p, side: "You send" })), ...get.map(p => ({ p, side: "You get" }))].map(({ p, side }) => `
    <tr>
      <td class="muted no-wrap">${side}</td>
      <td>${playerCell(p)}</td>
      <td class="num">${p.prevPpg != null ? fmt(p.prevPpg) : "–"}<div class="psub sub-right">${p.prevG ? p.prevG + " g" : ""}</div></td>
      <td class="num">${p.seasonAvg != null ? fmt(p.seasonAvg) : "–"}<div class="psub sub-right">${p.g ? p.g + " g" : ""}</div></td>
      <td class="num">${formCell(p)}</td>
      <td>${spark(p)}</td>
      <td class="num val">${fmt(p.value)}${p.injMult < 1 ? `<div class="psub sub-right">injury −${pct(1 - p.injMult)}</div>` : ""}</td>
      <td class="num">${fmt(p.vorp)}</td>
      <td><span class="weights">${weightText(p)}</span></td>
    </tr>`).join("");

  const notes = rosterNotes(r, pname);
  out.innerHTML = `
    <div class="result-top">
      <div class="stat-box"><span class="label">Your starters</span>
        <span class="big ${tone(r.dMe)}">${signed(r.dMe)}</span>
        <div class="small">${fmt(r.meBefore)} → ${fmt(r.meAfter)} pts/game</div></div>
      <div class="stat-box"><span class="label">${pname}'s starters</span>
        <span class="big ${tone(r.dThem)}">${signed(r.dThem)}</span>
        <div class="small">${fmt(r.themBefore)} → ${fmt(r.themAfter)} pts/game</div></div>
      <div class="stat-box"><span class="label">Value balance</span>${balanceBlock(r)}
        <div class="small mt6">${read}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th scope="col">Side</th><th scope="col">Player</th>
        <th scope="col" class="num">${esc(S.stats.prev_season)}</th><th scope="col" class="num">${esc(S.stats.season)}</th>
        <th scope="col" class="num">Last ${CFG.RECENT_GAMES}</th><th scope="col">Weeks</th><th scope="col" class="num">Value</th>
        <th scope="col" class="num" title="Points per game above replacement level">Above repl.</th><th scope="col">Value mix</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${notes.length ? `<p class="hint">${notes.join(" ")}</p>` : ""}
    <p class="hint">All numbers are points per game under your league's scoring. Balance compares how much each player scores above a replacement-level player.</p>`;
}

/* ---------------------------------------------------------- methodology */
function renderMethod() {
  const r = S.model.repl;
  const ex = n => {
    const wp = Math.max(CFG.W_PREV_MIN, CFG.W_PREV_START - CFG.W_PREV_DECAY * n);
    const rest = 1 - wp;
    return `after ${n} game${n > 1 ? "s" : ""}: ${pct(wp)} last season, ${pct(rest * (1 - CFG.RECENT_SHARE))} season average, ${pct(rest * CFG.RECENT_SHARE)} last ${CFG.RECENT_GAMES}`;
  };
  const prev = esc(S.stats.prev_season), cur = esc(S.stats.season);
  $("#method-body").innerHTML = `
    <p>Every point uses your league's scoring rules, applied to the official stats of each game.</p>
    <p><b>Value</b> is the expected points per game from here on. It blends three things:</p>
    <ul>
      <li><b>Last season (${prev})</b>: what the player has already proven. It carries a lot of weight early and fades with every game played this season.</li>
      <li><b>This season's average</b>: what he has done in ${cur}.</li>
      <li><b>Last ${CFG.RECENT_GAMES} games</b>: current form. It gets ${pct(CFG.RECENT_SHARE)} of this season's weight, so a player on a hot streak rises quickly.</li>
    </ul>
    <p>Example weights ${ex(1)}; ${ex(3)}; ${ex(8)}.</p>
    <p>Rookies and players without a track record start near replacement level and move away from it as they play. Players on IR count at half value and are never started; players listed as Out lose 10%.</p>
    <p><b>Replacement level</b> is what the best player left in free agency would score after every team in your league fills its starting slots. Right now: QB ${fmt(r.QB)}, RB ${fmt(r.RB)}, WR ${fmt(r.WR)}, TE ${fmt(r.TE)}, K ${fmt(r.K)}, DEF ${fmt(r.DEF)} pts/game.</p>
    <p><b>Above replacement</b> is value minus the replacement level of the player's position. It is the currency used for trade balance: a 14-point RB is worth more than a 9-point kicker because the RB is much harder to replace.</p>
    <p><b>Trade ideas</b>: the site tests every 1- or 2-player swap with every team. It only shows deals that raise your starters by at least ${fmt(CFG.MIN_GAIN_ME)} pts/game, also raise the partner's starters, and keep both sides close in value (the smaller side is worth at least ${pct(CFG.MIN_FAIRNESS)} of the larger one).</p>`;
}

/* ========================================================== start */
(function linkSource() {
  // On GitHub Pages (user.github.io/repo) point the footer at the repository.
  const a = $("#source-link");
  const m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
  const repo = location.pathname.split("/").filter(Boolean)[0];
  if (m && repo) a.href = `https://github.com/${m[1]}/${repo}`;
  else a.hidden = true;
})();

(function boot() {
  const q = new URLSearchParams(location.search);
  if (window.__EMBED__ || q.has("demo")) return startDemo();
  const league = q.get("league") || store.get("league");
  if (league && isLeagueId(league)) return openLeague(league, store.get("team:" + league));
  showEntry(league ? "That league link is not valid." : "");
})();
