/**
 * Backtest of the teammate adjustment, on the players it actually changes:
 * their rest-of-season error with and without the adjustment.
 *
 *   npm run backtest:teammates
 */
import { existsSync, readFileSync } from "node:fs";
import { it } from "vitest";
import { buildModel, type StatsFile } from "../../src/lib/model";
import { NFL } from "../../src/lib/sports/nfl";
import { actualAfter, truncate } from "./evaluate";
import { BENCHMARK_LEAGUES } from "./leagues";

const CHECKPOINTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

it("teammates", { timeout: 60 * 60 * 1000 }, () => {
  const lines: string[] = [];
  for (const chance of [0.3, 0.5, 0.7, 0.9]) {
    let n = 0;
    let errOff = 0;
    let errOn = 0;
    let closer = 0;
    for (const season of ["2024", "2025"]) {
      const url = new URL(`../../../.cache/seasons/nfl-${season}.json`, import.meta.url);
      if (!existsSync(url)) continue;
      const stats = JSON.parse(readFileSync(url, "utf8")) as StatsFile;
      for (const league of Object.values(BENCHMARK_LEAGUES)) {
        for (const week of CHECKPOINTS) {
          const view = truncate(stats, week);
          const off = buildModel(view, league, {
            ...NFL,
            model: { ...NFL.model, teammateReturn: 0 },
          });
          const on = buildModel(view, league, {
            ...NFL,
            model: { ...NFL.model, teammateReturn: chance },
          });
          const actual = actualAfter(stats, league, week, 3);
          for (const p of Object.values(on.players)) {
            const real = actual.get(p.id);
            if (!p.context || real === undefined) continue;
            const a = Math.abs(off.players[p.id]!.value - real);
            const b = Math.abs(p.value - real);
            n++;
            errOff += a;
            errOn += b;
            if (b < a) closer++;
          }
        }
      }
    }
    lines.push(
      `| ${chance} | ${n} | ${(errOff / n).toFixed(3)} | ${(errOn / n).toFixed(3)} | ${((100 * closer) / n).toFixed(0)}% |`,
    );
  }
  console.log(
    [
      "| Return chance | Cases | MAE without | MAE with | Closer to reality |",
      "|---|---|---|---|---|",
      ...lines,
    ].join("\n"),
  );
});
