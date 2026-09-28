import type { StatsFile } from "./model";
import { UserError } from "./sleeper/client";

/** Prefix for files in public/ (the site may live under /<repo> on GitHub Pages). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Light shape check: the file is ours, but a broken build should fail with a clear message. */
export function isStatsFile(x: unknown): x is StatsFile {
  return (
    isObject(x) &&
    typeof x.generated_at === "string" &&
    typeof x.season === "string" &&
    typeof x.prev_season === "string" &&
    Array.isArray(x.weeks) &&
    x.weeks.every((w) => Number.isInteger(w)) &&
    Array.isArray(x.keys) &&
    x.keys.every((k) => typeof k === "string") &&
    isObject(x.players)
  );
}

const cache = new Map<string, Promise<StatsFile>>();

/** Loads data/<sport>/stats.json (or the demo file) once per page. */
export function loadStats(sport: string, demo: boolean): Promise<StatsFile> {
  const file = `${BASE_PATH}/data/${sport}/${demo ? "demo_stats" : "stats"}.json`;
  let pending = cache.get(file);
  if (!pending) {
    pending = fetch(file, { cache: "no-cache" }).then(async (r) => {
      if (!r.ok) {
        throw new UserError(
          "The stats file is not available yet. It is rebuilt every morning; try again later.",
        );
      }
      const data: unknown = await r.json();
      if (!isStatsFile(data)) throw new UserError("The stats file is damaged. Try again later.");
      return data;
    });
    pending.catch(() => cache.delete(file));
    cache.set(file, pending);
  }
  return pending;
}
