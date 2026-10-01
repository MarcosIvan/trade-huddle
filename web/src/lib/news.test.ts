import { describe, expect, it } from "vitest";
import { parsePlayerNews, safeUrl, sourceName, timeAgo } from "./news";

const T0 = Date.parse("2026-10-01T12:00:00Z");

/** One item in the shape Sleeper sends. */
const raw = (title: string, hoursAgo: number, extra: Record<string, unknown> = {}) => ({
  metadata: { title, description: `${title}: details`, ...extra },
  source: "rotowire",
  sport: "nfl",
  player_id: "100",
  published: T0 - hoursAgo * 3_600_000,
});

describe("parsePlayerNews", () => {
  it("reads Sleeper's items", () => {
    const [first] = parsePlayerNews([
      raw("Limited at practice", 2, { url: "https://example.com/n/1", analysis: "Long text" }),
    ]);
    expect(first).toEqual({
      title: "Limited at practice",
      summary: "Limited at practice: details",
      url: "https://example.com/n/1",
      source: "RotoWire",
      time: T0 - 2 * 3_600_000,
    });
  });

  it("keeps the five latest, newest first", () => {
    const items = parsePlayerNews([3, 1, 7, 2, 6, 4, 5].map((h) => raw(`${h} h`, h)));
    expect(items.map((n) => n.title)).toEqual(["1 h", "2 h", "3 h", "4 h", "5 h"]);
  });

  it("keeps an item without a link, and drops unsafe links", () => {
    const items = parsePlayerNews([
      raw("No link", 1),
      raw("Script link", 2, { url: "javascript:alert(1)" }),
      raw("Data link", 3, { url: "data:text/html,<script>alert(1)</script>" }),
    ]);
    expect(items.map((n) => [n.title, n.url])).toEqual([
      ["No link", null],
      ["Script link", null],
      ["Data link", null],
    ]);
  });

  it("drops malformed items", () => {
    const items = parsePlayerNews([
      raw("Fine", 1),
      raw("", 1),
      { ...raw("No date", 1), published: "yesterday" },
      { source: "rotowire", published: T0 },
      "junk",
      null,
    ]);
    expect(items.map((n) => n.title)).toEqual(["Fine"]);
    expect(parsePlayerNews(null)).toEqual([]);
    expect(parsePlayerNews({ title: "x" })).toEqual([]);
  });
});

describe("safeUrl", () => {
  it("allows only http(s)", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("http://example.com/")).toBe("http://example.com/");
    expect(safeUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeUrl(" javascript:alert(1)")).toBeNull();
    expect(safeUrl("/relative")).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });
});

describe("sourceName", () => {
  it("names the known sources and tidies the rest", () => {
    expect(sourceName("rotoballer")).toBe("RotoBaller");
    expect(sourceName("fantasy_pros")).toBe("FantasyPros");
    expect(sourceName("some_site")).toBe("Some Site");
  });
});

describe("timeAgo", () => {
  it("reads like a feed", () => {
    expect(timeAgo(T0 - 30_000, T0)).toBe("just now");
    expect(timeAgo(T0 - 25 * 60_000, T0)).toBe("25 min ago");
    expect(timeAgo(T0 - 3 * 3_600_000, T0)).toBe("3 h ago");
    expect(timeAgo(T0 - 30 * 3_600_000, T0)).toBe("yesterday");
    expect(timeAgo(T0 - 4 * 86_400_000, T0)).toBe("4 days ago");
    expect(timeAgo(Date.parse("2026-09-10T12:00:00Z"), T0)).toBe("Sep 10");
  });
});
