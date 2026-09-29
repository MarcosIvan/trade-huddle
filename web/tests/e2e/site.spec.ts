import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { HOSTILE, USERNAME, expect, ideasReady, mockSleeper, test } from "./fixtures";

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
      "Fantasy football trade analyzer for Sleeper",
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

    // The league title and the hostile team (in the team picker) are text, not markup.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(HOSTILE.league);
    await expect(page.locator("header select option", { hasText: "Evil" })).toHaveText(
      HOSTILE.team,
    );
    // Nothing from the names became an element or ran.
    expect(await page.locator("main img, main svg[onload], main script").count()).toBe(0);
    expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBeUndefined();
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

  test("reruns the ideas with a new ideal roster, within 14 players", async ({ page }) => {
    const update = page.getByRole("button", { name: "Update trade ideas" });
    await page.getByRole("button", { name: "One more RB" }).click();
    await page.getByRole("button", { name: "One more WR" }).click();
    // 16 players: blocked, with the reason on hover.
    await expect(update).toHaveAttribute("aria-disabled", "true");
    await update.hover();
    await expect(page.getByRole("tooltip")).toContainText("Remove 2 players");
    await page.getByRole("button", { name: "One fewer RB" }).click();
    await page.getByRole("button", { name: "One fewer WR" }).click();
    await page.getByRole("button", { name: "One fewer TE" }).click();
    await update.click();
    await ideasReady(page);
    await expect(page.locator("#ideas article")).toHaveCount(3);
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

  test("finds deals for a chosen player", async ({ page }) => {
    await page.locator("#finder select").selectOption({ index: 1 });
    await expect(page.locator('#finder [aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
    await expect(page.locator("#finder article").first()).toBeVisible();
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`is accessible in the ${scheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.getByRole("button", { name: "Open in analyzer" }).first().click();
      expect(await accessibilityProblems(page)).toEqual([]);
    });
  }

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
