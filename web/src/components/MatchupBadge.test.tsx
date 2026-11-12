import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MATCHUP_LEVELS } from "@/lib/model";
import { MatchupBadge, MatchupTone } from "./MatchupBadge";

describe("MatchupBadge", () => {
  it("reads without color: an icon hidden from screen readers and the word", () => {
    const html = renderToStaticMarkup(<MatchupBadge level="tough" title="KC allows fewer" />);
    expect(html).toContain('<span aria-hidden="true">▼</span> <span>Tough</span>');
    expect(html).toContain('title="KC allows fewer"');
  });

  it("labels every level", () => {
    const html = MATCHUP_LEVELS.map((level) =>
      renderToStaticMarkup(<MatchupBadge level={level} />),
    );
    expect(html[0]).toContain('<span aria-hidden="true">▲▲</span> <span>Great</span>');
    expect(html[1]).toContain('<span aria-hidden="true">▲</span> <span>Good</span>');
    expect(html[2]).toContain('<span aria-hidden="true">●</span> <span>Neutral</span>');
    expect(html[3]).toContain('<span aria-hidden="true">▼</span> <span>Tough</span>');
    expect(html[4]).toContain('<span aria-hidden="true">▼▼</span> <span>Brutal</span>');
  });

  it("keeps the word for screen readers when compact", () => {
    const html = renderToStaticMarkup(<MatchupBadge level="good" compact />);
    expect(html).toContain(
      '<span aria-hidden="true">▲</span> <span class="visually-hidden">Good</span>',
    );
  });
});

describe("MatchupTone", () => {
  it("colors any content as the level and names the level for screen readers", () => {
    const html = renderToStaticMarkup(
      <MatchupTone level="brutal" title="hard road">
        30 of 32
      </MatchupTone>,
    );
    expect(html).toContain("brutal");
    expect(html).toContain('title="hard road"');
    expect(html).toContain('30 of 32<span class="visually-hidden"> (Brutal)</span>');
  });
});
