import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  HOSTILE,
  LEAGUE_ID,
  NEWS_DOWN,
  NEWS_PLAYER,
  USERNAME,
  expect,
  ideasReady,
  mockSleeper,
  test,
} from "./fixtures";

/** WCAG 2.1 A and AA problems on the page, as "rule: first element" lines. */
async function accessibilityProblems(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
}

/** The page ends at the footer: nothing (like hidden text) stretches it past it or sideways. */
async function expectNoEmptySpace(page: Page): Promise<void> {
  const size = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    footerBottom: Math.round(
      document.querySelector("footer")!.getBoundingClientRect().bottom + scrollY,
    ),
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(size.height).toBeLessThanOrEqual(Math.max(size.footerBottom, 0) + 1);
  expect(size.width).toBeLessThanOrEqual(size.viewport);
}

test.describe("entry screen", () => {
  test("is prerendered, protected by the CSP and accessible", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Fantasy football and basketball trade analyzer for Sleeper",
    );
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
    expect(await accessibilityProblems(page)).toEqual([]);
  });

  test("shows a friendly message for an unknown username", async ({ page }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill("nobody_here");
    await page.getByRole("button", { name: "Find my leagues" }).click();
    await expect(page.getByText('No Sleeper user named "nobody_here"')).toBeVisible();
  });
});

test.describe("hostile names from Sleeper", () => {
  test("show as plain text and never run", async ({ page }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill(USERNAME);
    await page.getByRole("button", { name: "Find my leagues" }).click();

    // The league list shows the hostile league name as text.
    const hostileLeague = page.getByRole("button", { name: /Hostile League/ });
    await expect(hostileLeague).toContainText(HOSTILE.league);
    await hostileLeague.click();
    await ideasReady(page);

    // The league title and the hostile team (in the analyzer's partner picker) are text, not markup.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HOSTILE.league);
    await expect(
      page.getByLabel("Trade with").locator("option", { hasText: "Evil" }),
    ).toContainText(HOSTILE.team);
    // Nothing from the names became an element or ran.
    expect(await page.locator("main img, main svg[onload], main script").count()).toBe(0);
    expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBeUndefined();
  });
});

test.describe("league picker", () => {
  test("lists the user's NFL and NBA leagues, grouped by sport", async ({ page }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill(USERNAME);
    await page.getByRole("button", { name: "Find my leagues" }).click();

    await expect(page.getByRole("button", { name: /Hoops League/ })).toBeEnabled();
    await page.getByRole("button", { name: /Hostile League/ }).click();
    await ideasReady(page);

    // No team picker and no "Change league": one league picker, leagues grouped by sport.
    await expect(page.getByLabel("View as")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change league" })).toHaveCount(0);
    const picker = page.getByLabel("League", { exact: true });
    await expect(picker.locator("option")).toHaveCount(3);
    await expect(picker.locator("optgroup")).toHaveCount(2);
    await expect(picker.locator("optgroup").nth(1)).toHaveAttribute("label", "NBA");
    await expect(picker.locator("option", { hasText: "Hoops League" })).toBeEnabled();
    await expect(picker).toHaveValue(LEAGUE_ID);
    expect(await accessibilityProblems(page)).toEqual([]);
  });
});

test.describe("NBA league", () => {
  test("opens with the NBA's slots, every position a player can play and trade ideas", async ({
    page,
  }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill(USERNAME);
    await page.getByRole("button", { name: "Find my leagues" }).click();
    await page.getByRole("button", { name: /Hoops League/ }).click();
    await ideasReady(page);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hoops League");
    const team = page.locator("#team");
    // This week's best team: each game left, and his best game's projection (lock-in scoring).
    await expect(team.getByRole("columnheader", { name: "Games" })).toBeVisible();
    await expect(team.getByRole("columnheader", { name: "High proj." })).toBeVisible();
    await expect(team.getByRole("columnheader", { name: "Trade value" })).toBeVisible();
    for (const slot of ["PG", "G", "F", "UTIL"]) {
      await expect(team.getByRole("rowheader", { name: slot, exact: true }).first()).toBeVisible();
    }
    // Every eligible position, not only the main one.
    const second = team.getByRole("row", { name: /Hoop Player 3\b/ });
    await expect(second).toContainText("SG");
    await expect(second).toContainText("SF");
    await expect(team.getByTitle(/last 12 games/).first()).toBeAttached();
    await expect(page.locator("#ideas article").first()).toBeVisible();
    expect(await accessibilityProblems(page)).toEqual([]);

    // The finder by position and the Leaders tab use the NBA's positions.
    const finder = page.locator("#finder");
    await finder.getByText("Get a position", { exact: true }).click();
    const positions = await finder
      .getByLabel("Position", { exact: true })
      .locator("option")
      .allTextContents();
    expect(positions).toEqual(["PG", "SG", "SF", "PF", "C"]);
    await expect(finder.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    await page.getByRole("tab", { name: "Leaders" }).click();
    const leaders = page.locator("#leaders");
    for (const pos of positions)
      await expect(leaders.getByRole("radio", { name: pos, exact: true })).toBeAttached();
    await expect(leaders.locator("tbody tr").first()).toBeVisible();
    // Free agency: the NBA's positions (every player in this small league is on a roster).
    await page.getByRole("tab", { name: "Free agency" }).click();
    const free = page.locator("#free-agents");
    for (const pos of positions)
      await expect(free.getByRole("radio", { name: pos, exact: true })).toBeAttached();
    await expect(free).toContainText("No PG free agents in this league.");
    await expect(page.locator("#pick-ideas")).toContainText("No free agent is an upgrade");
    await expect(page.locator("#pick-analyzer")).toBeVisible();
    await page.getByRole("tab", { name: "Team & trades" }).click();

    // The player card opens for NBA players too.
    await team.getByRole("button", { name: /^Hoop Player 1$/ }).click();
    const card = page.getByRole("dialog", { name: /Hoop Player 1/ });
    await expect(card).toBeVisible();
    // Each game day says which fantasy week it counts in.
    await expect(card.getByRole("columnheader", { name: "Date" })).toBeVisible();
    await expect(card.getByRole("columnheader", { name: "Wk" })).toBeVisible();
  });
  test("has no bye column, and no schedule strength before the first games", async ({ page }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill(USERNAME);
    await page.getByRole("button", { name: "Find my leagues" }).click();
    await page.getByRole("button", { name: /Hoops League/ }).click();
    await ideasReady(page);

    const analyzer = page.locator("#analyzer");
    await page.getByRole("button", { name: "Open in analyzer" }).first().click();
    const table = analyzer.locator("table").first();
    await expect(table.getByRole("columnheader", { name: "Regular schedule" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Bye" })).toHaveCount(0);
    await expect(table.locator("td span[title*='information only']")).toHaveCount(0);
  });
});

test.describe("player news", () => {
  test.beforeEach(async ({ page }) => {
    await mockSleeper(page);
    await page.goto("./");
    await page.getByLabel("Sleeper username").fill(USERNAME);
    await page.getByRole("button", { name: "Find my leagues" }).click();
    await page.getByRole("button", { name: /Hostile League/ }).click();
    await ideasReady(page);
  });

  test("opens a player's latest news, newest first, links in a new tab", async ({ page }) => {
    await page
      .getByRole("button", { name: `News about ${NEWS_PLAYER.name}` })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: new RegExp(NEWS_PLAYER.name) });
    await expect(dialog).toBeVisible();

    // Newest first; items without a (safe) link show as plain text.
    const items = dialog.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(items.nth(0)).toContainText("RotoBaller · 1 h ago");
    await expect(items.nth(1)).toContainText("Practice report: details");
    await expect(items.nth(2)).toContainText("Script link");

    // The hostile headline is text; the javascript: link was dropped.
    const links = dialog.getByRole("link");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText(HOSTILE.headline);
    await expect(links.first()).toHaveAttribute("href", "https://example.com/story");
    await expect(links.first()).toHaveAttribute("target", "_blank");
    await expect(links.first()).toHaveAttribute("rel", "noopener noreferrer");
    expect(await accessibilityProblems(page)).toEqual([]);
    expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBeUndefined();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("says so when a player has no news, or Sleeper fails", async ({ page }) => {
    // Any player of yours but the two with mocked news.
    await page.getByRole("button", { name: "News about Enzo Coutinho" }).first().click();
    await expect(page.getByRole("dialog")).toContainText("No recent news about Enzo Coutinho.");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page
      .getByRole("button", { name: `News about ${NEWS_DOWN.name}` })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toContainText("Could not load the news from Sleeper.");
  });

  test("shows each player's bye and schedule strength in the analyzer, for information", async ({
    page,
  }) => {
    const analyzer = page.locator("#analyzer");
    await page.getByRole("button", { name: "Open in analyzer" }).first().click();
    const table = analyzer.locator("table").first();
    // Trade value, points and recent form first; then the bye and the two schedules.
    const headers = await table.locator("thead th").allInnerTexts();
    expect(headers.map((h) => h.replace(/\s+/g, " ").trim().toLowerCase())).toEqual([
      "player",
      "trade value",
      "pts/g",
      "last 3",
      "bye",
      "regular schedule",
      "playoffs schedule",
    ]);
    const ranks = analyzer.locator("td span[title*='information only']");
    await expect(ranks.first()).toHaveText(/^\d+ of \d+$/);
    await expect(ranks.first()).toHaveAttribute("title", /^(Regular season left|Playoffs): /);
    expect(await accessibilityProblems(page)).toEqual([]);
  });

  test("doesn't pick the player in the analyzer", async ({ page }) => {
    const analyzer = page.locator("#analyzer");
    const row = analyzer.locator("label", { hasText: NEWS_PLAYER.name });
    await row.getByRole("button", { name: /News about/ }).click();
    await page.keyboard.press("Escape");
    await expect(row.getByRole("checkbox")).not.toBeChecked();
  });
});

test.describe("demo league", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("./?demo");
    await ideasReady(page);
  });

  test("suggests three trade ideas, none a same-position 1-for-1 swap", async ({ page }) => {
    const cards = page.locator("#ideas article");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const sides = await card
        .locator("ul")
        .evaluateAll((lists) =>
          lists.map((ul) => [...ul.querySelectorAll("li")].map((li) => li.textContent ?? "")),
        );
      const [give = [], get = []] = sides;
      const pos = (row: string) => row.slice(0, 2);
      const sameSpot = give.length === 1 && get.length === 1 && pos(give[0]!) === pos(get[0]!);
      expect(sameSpot, `idea: ${give.join()} for ${get.join()}`).toBe(false);
    }
  });

  test("suggests only even trades, with no ideal roster editor", async ({ page }) => {
    await expect(page.getByText("Ideal roster")).toHaveCount(0);
    const cards = page.locator("#ideas article");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const [give = 0, get = 0] = await card
        .locator("ul")
        .evaluateAll((lists) => lists.map((ul) => ul.querySelectorAll("li").length));
      expect(give).toBe(get);
      expect(give).toBeLessThanOrEqual(2);
    }
  });

  test("builds the analyzer card only as players are picked", async ({ page }) => {
    const analyzer = page.locator("#analyzer");
    await expect(analyzer.locator(".card")).toHaveCount(0);
    await expectNoEmptySpace(page);

    await page.getByRole("button", { name: "Open in analyzer" }).first().click();
    await expect(analyzer.getByRole("heading", { name: "You send" })).toBeVisible();
    await expect(analyzer.getByRole("heading", { name: "You receive" })).toBeVisible();
    await expect(analyzer.getByText("Trade value").first()).toBeVisible();
    await expectNoEmptySpace(page);
  });

  test("keeps the cards simple: no need badges and no list of what is missing", async ({
    page,
  }) => {
    await expect(page.getByText(/Fills (your|their) need/)).toHaveCount(0);
    await expect(page.getByText("What is missing")).toHaveCount(0);
  });

  test("finds deals for a chosen player", async ({ page }) => {
    await page.locator("#finder select").selectOption({ index: 1 });
    await expect(page.locator('#finder [aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator("#finder article").first()).toBeVisible();
  });

  test("gets a player found by typing his name", async ({ page }) => {
    const finder = page.locator("#finder");
    await finder.getByText("Get a player", { exact: true }).click();
    const search = finder.getByRole("combobox", { name: "Player" });
    await search.fill("feli");
    const options = finder.getByRole("option");
    await expect(options.first()).toBeVisible();
    for (const text of await options.allTextContents()) expect(text).toMatch(/^Felix/);
    expect(await accessibilityProblems(page)).toEqual([]);
    const first = (await finder.getByRole("option").first().locator("span").first().textContent())!;
    await search.press("ArrowDown");
    await search.press("ArrowUp");
    await search.press("Enter");
    await expect(search).toHaveValue(first);
    await expect(finder.getByRole("listbox")).toBeHidden();
    await expect(finder.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    const cards = finder.locator("article");
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      await expect(card.locator("ul").nth(1)).toContainText(first);
    }
  });

  test("gets a top player at a position, two-for-two, sending the chosen player", async ({
    page,
  }) => {
    const finder = page.locator("#finder");
    await finder.getByText("Get a position", { exact: true }).click();
    await finder.getByLabel("Position", { exact: true }).selectOption("WR");
    await finder.getByLabel("Ranked").selectOption("10");
    const offer = finder.getByLabel("Player you offer");
    const rb = (await offer.locator("option").filter({ hasText: "· RB ·" }).first().textContent())!;
    await offer.selectOption({ label: rb });
    const name = rb.split(" · ")[0]!;

    // The league's top 10 receivers by trade value, from the Leaders tab's ranking.
    await expect(finder.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    const cards = finder.locator("article");
    await expect(cards).toHaveCount(3);
    const deals = await cards.evaluateAll((list) =>
      list.map((card) =>
        [...card.querySelectorAll("ul")].map((ul) =>
          [...ul.querySelectorAll("li")].map((li) => li.textContent ?? ""),
        ),
      ),
    );
    await page.getByRole("tab", { name: "Leaders" }).click();
    const leaders = page.locator("#leaders");
    await leaders.getByText("WR", { exact: true }).click();
    const top = await leaders
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows
          .slice(0, 10)
          .map((r) => r.querySelector("button, td:nth-child(2) div div")?.textContent),
      );
    for (const [give = [], get = []] of deals) {
      expect(give).toHaveLength(2);
      expect(get).toHaveLength(2);
      expect(give.join()).toContain(name);
      expect(get.some((row) => top.some((t) => t && row.startsWith(t)))).toBe(true);
    }
  });

  test("ranks each position's leaders by trade value or season points", async ({ page }) => {
    const tab = page.getByRole("tab", { name: "Leaders" });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#finder")).toHaveCount(0);
    const leaders = page.locator("#leaders");
    const rows = leaders.locator("tbody tr");
    await expect(rows).toHaveCount(30);
    const column = (n: number) =>
      rows.evaluateAll(
        (list, i) =>
          list.map((r) => Number(r.children[i]!.textContent!.replace(",", ".").replace("–", "0"))),
        n,
      );
    const descending = (xs: number[]) => xs.every((x, i) => i === 0 || xs[i - 1]! >= x);
    expect(descending(await column(3))).toBe(true);
    await leaders.getByText("Season points").click();
    expect(descending(await column(4))).toBe(true);
    await expect(leaders.getByText("Free agent").first()).toBeAttached();
    expect(await accessibilityProblems(page)).toEqual([]);

    // Arrow keys move between tabs.
    await tab.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Team & trades" })).toBeFocused();
    await expect(page.locator("#finder")).toBeVisible();
  });

  test("lists free agents a page at a time, with pick ideas and the pick analyzer", async ({
    page,
  }) => {
    await page.getByRole("tab", { name: "Free agency" }).click();
    const list = page.locator("#free-agents");
    const rows = list.locator("tbody tr");
    await expect(rows.first()).toBeVisible();
    // Free agents only: no player from a roster in the league.
    await expect(list.getByText("You", { exact: true })).toHaveCount(0);
    expect(await rows.count()).toBeLessThanOrEqual(25);
    const firstName = await rows.first().locator("td").nth(1).innerText();
    const next = list.getByRole("button", { name: "Next" });
    if (await next.isVisible()) {
      await next.click();
      await expect(list.getByText(/^Page 2 of/)).toBeVisible();
      await expect(rows.first().locator("td").first()).toHaveText("26");
      expect(await rows.first().locator("td").nth(1).innerText()).not.toBe(firstName);
    }
    // Season stats or the week's projection, by position.
    await list.getByText("RB", { exact: true }).click();
    await expect(list.getByRole("columnheader", { name: "Carries" })).toBeAttached();
    const projections = list.getByText(/projections$/);
    if (await projections.count()) {
      await projections.click();
      await expect(list.getByRole("columnheader", { name: "Opp" })).toBeVisible();
    }

    // Pick ideas: one for one, at most three, each opening the analyzer.
    const ideas = page.locator("#pick-ideas article");
    const count = await ideas.count();
    expect(count).toBeLessThanOrEqual(3);
    if (count === 0) {
      await expect(page.locator("#pick-ideas")).toContainText("No free agent is an upgrade");
    } else {
      await expect(ideas.first()).toContainText("You drop");
      await expect(ideas.first()).toContainText("You add");
      await ideas.first().getByRole("button", { name: "Open in analyzer" }).click();
    }

    // The analyzer: a player you drop and a free agent you add, by position.
    const analyzer = page.locator("#pick-analyzer");
    await list
      .getByRole("button", { name: /^Analyze adding/ })
      .first()
      .click();
    await expect(analyzer.getByRole("radio", { name: "RB", exact: true })).toBeChecked();
    await analyzer.getByRole("radiogroup", { name: "You drop" }).getByRole("radio").last().check();
    await expect(analyzer.getByRole("img", { name: /you drop .*, you add / })).toBeVisible();
    await expect(analyzer.getByRole("heading", { name: "You add" })).toBeVisible();
    await expect(analyzer).not.toContainText("balanced roster");
    expect(await accessibilityProblems(page)).toEqual([]);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`is accessible in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByRole("button", { name: "Open in analyzer" }).first().click();
      expect(await accessibilityProblems(page)).toEqual([]);
    });
  }

  test("opens a player's card with his season, week by week", async ({ page }) => {
    await page
      .locator("#team")
      .getByRole("button", { name: /^Milo Valadares$/ })
      .first()
      .click();
    const card = page.getByRole("dialog", { name: /Milo Valadares/ });
    await expect(card.locator("dl")).toContainText(/[A-Z]+ rank#\d+Overall rank#\d+/);
    await expect(card.getByRole("columnheader", { name: "Rushing", exact: true })).toBeVisible();
    await expect(card.getByRole("columnheader", { name: "Receiving", exact: true })).toBeVisible();
    await expect(card.getByRole("row", { name: /^Total/ })).toBeVisible();
    expect(await accessibilityProblems(page)).toEqual([]);
    await card.getByRole("button", { name: "Close" }).click();
    await expect(card).toBeHidden();
  });

  test("keeps names in the analyzer's pick lists for picking, not for the card", async ({
    page,
  }) => {
    await expect(page.locator("#analyzer label button[title^='Stats and schedule']")).toHaveCount(
      0,
    );
  });

  test("shows no news icons: its players are fictional", async ({ page }) => {
    await expect(page.getByRole("button", { name: /news about/i })).toHaveCount(0);
  });

  test("fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open in analyzer" }).first().click();
    await expectNoEmptySpace(page);
  });
});

test("unknown addresses get the site's own 404 page", async ({ page }) => {
  const response = await page.goto("./no-such-page/");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Go to Trade Huddle" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Trades that make");
});
