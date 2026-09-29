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
};

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

/** Answers every Sleeper API call from the fixtures above; anything else is a test failure. */
export async function mockSleeper(page: Page): Promise<void> {
  const { me, league, rosters, users } = sleeperLeague();
  const routes: Record<string, unknown> = {
    [`/v1/user/${USERNAME}`]: { user_id: me, display_name: USERNAME },
    "/v1/state/nfl": { season: "2026", league_season: "2026" },
    [`/v1/user/${me}/leagues/nfl/2026`]: [
      { league_id: LEAGUE_ID, name: HOSTILE.league, total_rosters: rosters.length },
      { league_id: "9876543210987654321", name: "Second League", total_rosters: 10 },
    ],
    [`/v1/league/${LEAGUE_ID}`]: league,
    [`/v1/league/${LEAGUE_ID}/rosters`]: rosters,
    [`/v1/league/${LEAGUE_ID}/users`]: users,
  };
  await page.route("https://api.sleeper.app/**", (route) => {
    const path = new URL(route.request().url()).pathname;
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
  await expect(page.getByText("Ideal roster")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#ideas [aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
}
