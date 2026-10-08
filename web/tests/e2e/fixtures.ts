import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared setup for the end-to-end tests:
 * - every page records Content Security Policy violations and page errors,
 *   and each test fails if any appeared;
 * - Sleeper's API is mocked (nothing leaves the machine), serving the demo
 *   league under a fictional ID with hostile names in it.
 */

export const LEAGUE_ID = "1234567890123456789";
export const USERNAME = "coach_01";

/** Names a Sleeper user could set, meant to run code if they were inserted as HTML. */
export const HOSTILE = {
  league: `<img src=x onerror="window.__xss='league'">Hostile League`,
  team: `<script>window.__xss='team'</script><b>Evil</b> Team`,
  owner: `"><svg onload="window.__xss='owner'">`,
  headline: `<img src=x onerror="window.__xss='news'">Hostile headline`,
};

/** A player on the demo league's "my team", with news in the mocked news file. */
export const NEWS_PLAYER = { id: "1009", name: "Rafael Valadares" };
/** A player on the same team whose news request fails. */
export const NEWS_DOWN = { id: "1057", name: "Milo Valadares" };

/** Sleeper's news for NEWS_PLAYER: a hostile headline, a script link and an item without one. */
function playerNews() {
  const hoursAgo = (h: number) => Date.now() - h * 3_600_000;
  const item = (title: string, h: number, url?: string) => ({
    metadata: { title, description: `${title}: details`, ...(url ? { url } : {}) },
    source: "rotoballer",
    sport: "nfl",
    player_id: NEWS_PLAYER.id,
    published: hoursAgo(h),
  });
  return [
    item("Script link", 3, "javascript:window.__xss='link'"),
    item(HOSTILE.headline, 1, "https://example.com/story"),
    item("Practice report", 2),
  ];
}

const demo = JSON.parse(readFileSync("public/data/nfl/demo_league.json", "utf8")) as {
  league: Record<string, unknown>;
  rosters: { roster_id: number; owner_id: string }[];
  users: { user_id: string; display_name: string; metadata?: { team_name?: string } }[];
  my_roster_id: number;
};
const demoStats = readFileSync("public/data/nfl/demo_stats.json", "utf8");

/** The demo league as Sleeper would return it, with the hostile names planted. */
function sleeperLeague() {
  const me = demo.rosters.find((r) => r.roster_id === demo.my_roster_id)!.owner_id;
  const users = demo.users.map((u, i) =>
    i === 0 ? { ...u, display_name: HOSTILE.owner, metadata: { team_name: HOSTILE.team } } : u,
  );
  return {
    me,
    league: { ...demo.league, league_id: LEAGUE_ID, name: HOSTILE.league },
    rosters: demo.rosters,
    users,
  };
}

/** A fictional NBA points league: two teams of 13, with a stats file in the NBA's format. */
export const NBA_LEAGUE_ID = "5555555555555555555";
const NBA_SLOTS = ["PG", "SG", "G", "SF", "PF", "F", "C", "UTIL", "UTIL", "BN", "BN", "BN", "BN"];
const NBA_ELIG = [["PG"], ["PG", "SG"], ["SG", "SF"], ["SF", "PF"], ["PF", "C"], ["C"]];

function nbaLeague(me: string) {
  const ids = Array.from({ length: 26 }, (_, i) => String(9100 + i));
  const players = Object.fromEntries(
    ids.map((id, i) => {
      const fp = NBA_ELIG[i % NBA_ELIG.length]!;
      const ppg = 30 - i * 0.6;
      // Keys: pts, reb, ast; last season's totals over 70 games, this season's per game.
      return [
        id,
        {
          n: `Hoop Player ${i + 1}`,
          p: fp[0],
          fp,
          t: ["AAA", "BBB", "CCC"][i % 3],
          prev: { g: 70, s: [0, ppg * 70, 1, 7 * 70, 2, 5 * 70] },
          proj: [0, ppg, 1, 7, 2, 5],
          adp: { std: i * 6 + 1 },
        },
      ];
    }),
  );
  const stats = {
    generated_at: "2026-10-08T10:00:00+00:00",
    sport: "nba",
    period: "day",
    season: "2026",
    prev_season: "2025",
    weeks: [],
    keys: ["pts", "reb", "ast"],
    usage_keys: [],
    season_games: 82,
    proj_per_game: true,
    schedule: { "1": [["BBB", "AAA"]], "2": [["CCC", "BBB"]] },
    day_weeks: { "1": 1, "2": 1 },
    day_dates: { "1": "2026-10-20", "2": "2026-10-21" },
    lineup_week: 1,
    team_weeks: {},
    players,
  };
  const other = "8888";
  return {
    stats: JSON.stringify(stats),
    league: {
      league_id: NBA_LEAGUE_ID,
      name: "Hoops League",
      sport: "nba",
      season: "2026",
      total_rosters: 2,
      roster_positions: NBA_SLOTS,
      scoring_settings: { pts: 0.5, reb: 1, ast: 1 },
      settings: { num_teams: 2, type: 0 },
    },
    rosters: [
      { roster_id: 1, owner_id: me, players: ids.filter((_, i) => i % 2 === 0) },
      { roster_id: 2, owner_id: other, players: ids.filter((_, i) => i % 2 === 1) },
    ],
    users: [
      { user_id: me, display_name: USERNAME, metadata: { team_name: "Court Kings" } },
      { user_id: other, display_name: "rival_02", metadata: { team_name: "Rim Runners" } },
    ],
  };
}

/** Answers every Sleeper API call from the fixtures above; anything else is a test failure. */
export async function mockSleeper(page: Page): Promise<void> {
  const { me, league, rosters, users } = sleeperLeague();
  const nba = nbaLeague(me);
  const routes: Record<string, unknown> = {
    [`/v1/user/${USERNAME}`]: { user_id: me, display_name: USERNAME },
    "/v1/state/nfl": { season: "2026", league_season: "2026" },
    [`/v1/user/${me}/leagues/nfl/2026`]: [
      { league_id: LEAGUE_ID, name: HOSTILE.league, total_rosters: rosters.length },
      { league_id: "9876543210987654321", name: "Second League", total_rosters: 10 },
    ],
    "/v1/state/nba": { season: "2026", league_season: "2026" },
    [`/v1/user/${me}/leagues/nba/2026`]: [
      { league_id: NBA_LEAGUE_ID, name: "Hoops League", total_rosters: 2 },
    ],
    [`/v1/league/${NBA_LEAGUE_ID}`]: nba.league,
    [`/v1/league/${NBA_LEAGUE_ID}/rosters`]: nba.rosters,
    [`/v1/league/${NBA_LEAGUE_ID}/users`]: nba.users,
    [`/v1/league/${LEAGUE_ID}`]: league,
    [`/v1/league/${LEAGUE_ID}/rosters`]: rosters,
    [`/v1/league/${LEAGUE_ID}/users`]: users,
  };
  await page.route("https://api.sleeper.app/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const news = /^\/players\/nfl\/([^/]+)\/news$/.exec(path);
    if (news) {
      if (news[1] === NEWS_DOWN.id) return route.fulfill({ status: 404, json: null });
      return route.fulfill({ json: news[1] === NEWS_PLAYER.id ? playerNews() : [] });
    }
    // Like Sleeper: an unknown username is a 200 with null; anything else unmocked is a 404.
    if (!(path in routes)) {
      const unknownUser = /^\/v1\/user\/[^/]+$/.test(path);
      return route.fulfill(unknownUser ? { json: null } : { status: 404, json: null });
    }
    return route.fulfill({ json: routes[path] });
  });
  // A real league reads the daily stats file, which CI doesn't build: serve the demo stats.
  await page.route("**/data/nfl/stats.json", (route) =>
    route.fulfill({ body: demoStats, contentType: "application/json" }),
  );
  await page.route("**/data/nba/stats.json", (route) =>
    route.fulfill({ body: nba.stats, contentType: "application/json" }),
  );
}

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (e) => {
          console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
        });
      });
      page.on("console", (m) => {
        if (m.type() === "error") problems.push(m.text());
      });
      page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
      page.on("dialog", (d) => {
        problems.push(`dialog opened: ${d.message()}`);
        void d.dismiss();
      });
      await use(problems);
      // Every test ends with a clean console: no CSP violation, no script error.
      expect(problems.filter((p) => !/status of 404/.test(p))).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits until the trade ideas (Web Worker) have finished searching. */
export async function ideasReady(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Trade ideas" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('#ideas [aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
}
