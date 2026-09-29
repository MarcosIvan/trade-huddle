/**
 * Serves the static export (out/) the way GitHub Pages does, for the
 * end-to-end tests: under NEXT_PUBLIC_BASE_PATH (e.g. /trade-huddle), with
 * directory index.html files and out/404.html (status 404) for anything else.
 * Test-only: no caching, no compression, localhost only.
 *
 * Usage: node scripts/serve-out.mjs [port]   (default 4173)
 */
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";

const root = resolve("out");
const port = Number(process.argv[2] ?? 4173);
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

/** The file for a request path, or null when it is outside out/ or missing. */
async function resolveFile(pathname) {
  if (!pathname.startsWith(`${base}/`)) return null;
  const file = resolve(root, `.${decodeURIComponent(pathname.slice(base.length))}`);
  if (file !== root && !file.startsWith(root + sep)) return null;
  try {
    const info = await stat(file);
    const target = info.isDirectory() ? join(file, "index.html") : file;
    await stat(target);
    return target;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const file = await resolveFile(pathname);
  const path = file ?? join(root, "404.html");
  res.statusCode = file ? 200 : 404;
  res.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
  res.end(await readFile(path));
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving out/ at http://127.0.0.1:${port}${base}/`);
});
