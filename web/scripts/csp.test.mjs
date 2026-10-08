import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyCsp,
  buildPolicy,
  hashSource,
  injectPolicy,
  inlineScripts,
  policyProblems,
  securePage,
} from "./csp.mjs";

const page = (head, body = "") =>
  `<!DOCTYPE html><html><head><meta charSet="utf-8"/>${head}</head><body>${body}</body></html>`;

const policyOf = (html) =>
  /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/.exec(html)?.[1] ?? null;

describe("hashes", () => {
  it("matches the CSP spec's example hash", () => {
    // From the CSP Level 3 specification and MDN.
    expect(hashSource("alert('Hello, world.');")).toBe(
      "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='",
    );
  });

  it("reads inline scripts exactly, and skips scripts loaded from a file", () => {
    const html = page(
      '<script src="/theme-init.js"></script><script>a()</script>',
      '<script type="application/ld+json">{"x":1}</script><script>\n  b();\n</script>',
    );
    expect(inlineScripts(html)).toEqual(["a()", '{"x":1}', "\n  b();\n"]);
  });

  it("ends a script at any end tag the browser accepts", () => {
    // Browsers end a script at "</script" followed by whitespace, "/" or ">", whatever comes next.
    const html = page("<script>a()</script\t\n bar><script>b()</SCRIPT ><script>c()</script/>");
    expect(inlineScripts(html)).toEqual(["a()", "b()", "c()"]);
  });
});

describe("policy", () => {
  const policy = buildPolicy(["'sha256-A'", "'sha256-B'", "'sha256-A'"]);

  it("allows only this site's scripts plus the hashed inline ones", () => {
    expect(policy).toContain("script-src 'self' 'sha256-A' 'sha256-B';");
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("starts from nothing and opens only what the site uses", () => {
    expect(policy.split("; ")).toEqual([
      "default-src 'none'",
      "script-src 'self' 'sha256-A' 'sha256-B'",
      "style-src 'self'",
      "img-src 'self'",
      "font-src 'self'",
      "connect-src 'self' https://api.sleeper.app",
      "worker-src 'self'",
      "manifest-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "object-src 'none'",
    ]);
  });
});

describe("injection", () => {
  it("goes right after <meta charset>, before any script", () => {
    const html = injectPolicy(page('<script src="/a.js"></script>'), "default-src 'none'");
    expect(html.indexOf("Content-Security-Policy")).toBeGreaterThan(html.indexOf("charSet"));
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  });

  it("replaces an older policy instead of adding a second one", () => {
    const once = securePage(page("<script>a()</script>"));
    const twice = securePage(once);
    expect(twice.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(twice).toBe(once);
  });

  it("hashes each page's own scripts", () => {
    const html = securePage(page("<script>a()</script>", "<script>b()</script>"));
    expect(policyOf(html)).toContain(`${hashSource("a()")} ${hashSource("b()")}`);
  });
});

describe("markup the policy would break", () => {
  it.each([
    ["a <style> block", page("<style>body{color:red}</style>")],
    ["a style attribute", page("", '<div style="color:red">x</div>')],
    ["an inline onclick handler", page("", '<button onclick="go()">x</button>')],
    ["a javascript: URL", page("", '<a href="javascript:go()">x</a>')],
  ])("fails the build on %s", (kind, html) => {
    expect(policyProblems(html).join()).toContain(kind);
    expect(() => securePage(html, "index.html")).toThrow(/index\.html has markup the CSP/);
  });

  it("ignores markup quoted inside a script (the RSC payload)", () => {
    const html = page("", '<script>push("<div style=\\"x\\" onclick=\\"y\\">")</script>');
    expect(policyProblems(html)).toEqual([]);
  });
});

describe("applyCsp", () => {
  let dir;
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("secures every HTML file in the export, nested ones included", async () => {
    dir = await mkdtemp(join(tmpdir(), "csp-"));
    await mkdir(join(dir, "404"));
    await writeFile(join(dir, "index.html"), page("<script>a()</script>"));
    await writeFile(join(dir, "404", "index.html"), page("", "<script>b()</script>"));
    await writeFile(join(dir, "data.json"), "{}");

    expect(await applyCsp(dir)).toEqual({ pages: 2, scripts: 2 });
    expect(policyOf(await readFile(join(dir, "index.html"), "utf8"))).toContain(hashSource("a()"));
    expect(policyOf(await readFile(join(dir, "404", "index.html"), "utf8"))).toContain(
      hashSource("b()"),
    );
    expect(await readFile(join(dir, "data.json"), "utf8")).toBe("{}");
  });

  it("refuses an empty export", async () => {
    dir = await mkdtemp(join(tmpdir(), "csp-"));
    await expect(applyCsp(dir)).rejects.toThrow(/No HTML files/);
  });
});
