/**
 * Content Security Policy for the static export. GitHub Pages can't send
 * headers, so the policy goes in a <meta> tag. Next's export puts a few
 * inline scripts in each page (the React Server Components payload), so
 * instead of allowing 'unsafe-inline' this runs after `next build` and, for
 * every HTML file in out/:
 *   1. hashes each inline script (SHA-256);
 *   2. writes a policy that allows exactly those scripts;
 *   3. injects it right after <meta charset>, before any script or link.
 * It fails the build on markup the policy would silently break: <style>
 * blocks, style="" attributes, inline event handlers and javascript: URLs.
 * See docs/adr/0009-content-security-policy.md.
 *
 * Usage: node scripts/csp.mjs [dir]   (default: out)
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/** The only outside address the site talks to (from the browser). */
export const SLEEPER_API = "https://api.sleeper.app";

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const CSP_META = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/gi;
const CHARSET_META = /<meta\s+charset=[^>]*>/i;

/** The text of every inline script (no src attribute), exactly as the browser hashes it. */
export function inlineScripts(html) {
  const out = [];
  for (const [, attrs, body] of html.matchAll(SCRIPT)) {
    if (!/\bsrc\s*=/i.test(attrs)) out.push(body);
  }
  return out;
}

/** A CSP hash source for a script's text. */
export function hashSource(text) {
  return `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
}

/** The policy for a page whose inline scripts have these hash sources. */
export function buildPolicy(hashes) {
  const scripts = ["'self'", ...new Set(hashes)].join(" ");
  return [
    "default-src 'none'",
    `script-src ${scripts}`,
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    `connect-src 'self' ${SLEEPER_API}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * Markup the policy would block without any build error: inline styles and
 * inline event handlers. Script contents are skipped (the RSC payload quotes
 * markup as data).
 */
export function policyProblems(html) {
  const markup = html.replace(SCRIPT, "<script></script>");
  const problems = [];
  if (/<style\b/i.test(markup)) problems.push("a <style> block");
  for (const [tag] of markup.matchAll(/<[a-z][^>]*>/gi)) {
    if (/\sstyle\s*=/i.test(tag)) problems.push(`a style attribute: ${tag.slice(0, 80)}`);
    const handler = /\s(on[a-z]+)\s*=/i.exec(tag);
    if (handler) problems.push(`an inline ${handler[1]} handler: ${tag.slice(0, 80)}`);
    if (/\s(?:href|src|action)\s*=\s*["']?\s*javascript:/i.test(tag)) {
      problems.push(`a javascript: URL: ${tag.slice(0, 80)}`);
    }
  }
  return problems;
}

/** Puts the policy meta tag right after <meta charset> (or <head>), replacing an older one. */
export function injectPolicy(html, policy) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}"/>`;
  const clean = html.replace(CSP_META, "");
  if (CHARSET_META.test(clean)) return clean.replace(CHARSET_META, (m) => m + meta);
  if (/<head\b[^>]*>/i.test(clean)) return clean.replace(/<head\b[^>]*>/i, (m) => m + meta);
  throw new Error("No <head> to put the Content Security Policy in");
}

/** Adds the policy to one page. Throws when the page has markup the policy would break. */
export function securePage(html, name = "page") {
  const problems = policyProblems(html);
  if (problems.length) {
    throw new Error(`${name} has markup the CSP would block:\n  - ${problems.join("\n  - ")}`);
  }
  const clean = html.replace(CSP_META, "");
  const policy = buildPolicy(inlineScripts(clean).map(hashSource));
  return injectPolicy(clean, policy);
}

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(path)));
    else if (entry.name.endsWith(".html")) out.push(path);
  }
  return out;
}

/** Secures every HTML file under dir; returns how many pages and inline scripts it covered. */
export async function applyCsp(dir) {
  const files = await htmlFiles(dir);
  if (!files.length) throw new Error(`No HTML files in ${dir}: run next build first`);
  let scripts = 0;
  for (const file of files) {
    const html = await readFile(file, "utf8");
    const secured = securePage(html, relative(dir, file));
    scripts += inlineScripts(secured).length;
    await writeFile(file, secured);
  }
  return { pages: files.length, scripts };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dir = process.argv[2] ?? "out";
  applyCsp(dir).then(
    ({ pages, scripts }) =>
      console.log(`CSP: ${pages} pages, ${scripts} inline scripts allowed by hash`),
    (error) => {
      console.error(String(error instanceof Error ? error.message : error));
      process.exit(1);
    },
  );
}
