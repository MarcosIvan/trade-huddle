import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchupBadge } from "./MatchupBadge";

describe("MatchupBadge", () => {
  it("reads without color: an icon hidden from screen readers and the word", () => {
    const html = renderToStaticMarkup(<MatchupBadge level="tough" title="KC allows fewer" />);
    expect(html).toContain('<span aria-hidden="true">▼</span> <span>Tough</span>');
    expect(html).toContain('title="KC allows fewer"');
  });

  it("labels every level", () => {
    const html = (["good", "neutral", "tough"] as const).map((level) =>
      renderToStaticMarkup(<MatchupBadge level={level} />),
    );
    expect(html[0]).toContain('<span aria-hidden="true">▲</span> <span>Good</span>');
    expect(html[1]).toContain('<span aria-hidden="true">●</span> <span>Neutral</span>');
    expect(html[2]).toContain('<span aria-hidden="true">▼</span> <span>Tough</span>');
  });

  it("keeps the word for screen readers when compact", () => {
    const html = renderToStaticMarkup(<MatchupBadge level="good" compact />);
    expect(html).toContain(
      '<span aria-hidden="true">▲</span> <span class="visually-hidden">Good</span>',
    );
  });
});
