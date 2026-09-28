/**
 * Every text/background pair the components use must meet WCAG AA in both
 * themes: 4.5:1 for text, 3:1 for input borders and chart marks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../src/styles/tokens.css", import.meta.url)),
  "utf8",
);

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const open = css.indexOf("{", start);
  const body = css.slice(open + 1, css.indexOf("}", open));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1]!,
      m[2]!.toLowerCase(),
    ]),
  );
}

const light = block(":root {");
const dark = block(':root[data-theme="dark"] {');
const darkBySystem = block(':root:not([data-theme="light"]) {');

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** The position badge background: the position color at 14% over the surface. */
function tint(fg: string, bg: string, amount = 0.14): string {
  const f = rgb(fg);
  const b = rgb(bg);
  return (
    "#" +
    f
      .map((v, i) =>
        Math.round(v * amount + b[i]! * (1 - amount))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const TEXT: [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-2"],
  ["ink", "warn-soft"],
  ["ink-2", "bg"],
  ["ink-2", "surface"],
  ["ink-2", "surface-2"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface-2"],
  ["brand-ink", "brand"],
  ["brand-muted", "brand"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "accent-soft"],
  ["accent-ink", "accent"],
  ["good", "surface"],
  ["good", "good-soft"],
  ["warn", "surface"],
  ["warn", "warn-soft"],
  ["bad", "surface"],
  ["bad", "bad-soft"],
];

const GRAPHICS: [string, string][] = [
  ["muted", "surface"], // input and button borders
  ["bar-give", "surface-2"],
  ["bar-get", "surface-2"],
  ["accent", "surface"], // focus ring
];

const POSITIONS = ["qb", "rb", "wr", "te", "k", "def"];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme", (_, t) => {
  it.each(TEXT)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(GRAPHICS)("graphic %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(3);
  });

  it.each(POSITIONS)("position badge %s is readable", (pos) => {
    expect(contrast(t[pos]!, tint(t[pos]!, t.surface!))).toBeGreaterThanOrEqual(4.5);
  });
});

it("uses the same dark palette for the system setting and data-theme", () => {
  expect(darkBySystem).toEqual(dark);
  expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
});
